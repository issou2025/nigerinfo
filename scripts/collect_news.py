#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Niger Info Veille - Collecteur d'Actualités Ultra-Puissant en Python
Caractéristiques : Multi-threadé (concurrence de 5), tolérant aux pannes,
extraction d'images, classification intelligente et support du mode démon.
"""

import os
import sys
import json
import time
import hashlib
import urllib.parse
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import warnings

# Tenter d'importer les dépendances externes requises
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Erreur : Les bibliothèques 'requests' et 'beautifulsoup4' sont requises.")
    print("Veuillez installer les dépendances en lançant : pip install requests beautifulsoup4")
    sys.exit(1)

# Désactiver les avertissements SSL pour les sites avec certificats expirés/invalides
from requests.packages.urllib3.exceptions import InsecureRequestWarning
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

# Configurations
USER_AGENT = "NigerInfoVeilleBot/1.0 (+contact@example.com)"
MAX_ITEMS_PER_SOURCE = 10
MAX_TOTAL_ITEMS = 1000
MIN_TITLE_LENGTH = 30
TIMEOUT_SECONDS = 10
CONCURRENCY_LIMIT = 5
IMAGE_ENRICH_LIMIT_PER_SOURCE = 6

# Répertoire de travail
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PATH_SOURCES = os.path.join(BASE_DIR, '../data/sources.json')
PATH_NEWS = os.path.join(BASE_DIR, '../data/news.json')

def fetch_html(url):
    """Télécharge le HTML d'une page avec gestion des redirections et des certificats invalides."""
    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3'
    }
    
    # Premier essai avec vérification SSL stricte
    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS, allow_redirects=True)
        response.raise_for_status()
        return response.text
    except requests.exceptions.SSLError:
        # Deuxième essai sans vérification SSL (très utile pour les sites administratifs du Niger)
        response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS, allow_redirects=True, verify=False)
        response.raise_for_status()
        return response.text

def normalize_image_url(raw_url, base_url):
    """Normalise une URL d'image et écarte logos, icônes et pixels de suivi."""
    if not raw_url or not isinstance(raw_url, str):
        return ""

    candidate = raw_url.split(',')[-1].strip().split()[0]
    if not candidate or candidate.startswith(('data:', 'blob:')):
        return ""

    absolute_url = urllib.parse.urljoin(base_url, candidate)
    lower_url = absolute_url.lower()
    rejected_tokens = [
        'logo', 'icon', 'favicon', 'avatar', 'sprite', 'pixel', 'tracking',
        'facebook', 'twitter', 'instagram', 'youtube', 'whatsapp'
    ]
    if any(token in lower_url for token in rejected_tokens) or lower_url.endswith('.svg'):
        return ""
    return absolute_url

def image_from_tag(img_tag, base_url):
    """Extrait la meilleure URL disponible d'une balise image classique ou lazy-loadée."""
    if not img_tag:
        return ""
    for attribute in [
        'data-src', 'data-original', 'data-lazy-src', 'data-image',
        'data-srcset', 'srcset', 'src'
    ]:
        image_url = normalize_image_url(img_tag.get(attribute), base_url)
        if image_url:
            return image_url
    return ""

def extract_page_image(html, page_url):
    """Extrait l'image éditoriale depuis Open Graph, Twitter Cards ou le contenu."""
    soup = BeautifulSoup(html, 'html.parser')
    meta_candidates = [
        ('meta', {'property': 'og:image:secure_url'}, 'content'),
        ('meta', {'property': 'og:image'}, 'content'),
        ('meta', {'name': 'twitter:image'}, 'content'),
        ('meta', {'name': 'twitter:image:src'}, 'content'),
        ('link', {'rel': 'image_src'}, 'href')
    ]

    for tag_name, attributes, value_attribute in meta_candidates:
        element = soup.find(tag_name, attrs=attributes)
        if element:
            image_url = normalize_image_url(element.get(value_attribute), page_url)
            if image_url:
                return image_url

    content_image = soup.select_one('article img, main img, .article img, .post img')
    return image_from_tag(content_image, page_url)

def generate_news_id(source_name, title, url):
    """Génère un ID MD5 unique basé sur la source, le titre et l'URL."""
    hash_input = f"{source_name}-{title}-{url}".encode('utf-8')
    md5_hash = hashlib.md5(hash_input).hexdigest()
    return f"news-{md5_hash[:12]}"

def detect_region(title):
    """Détecte la région du Niger mentionnée dans le titre."""
    title_lower = title.lower()
    regions = ['Niamey', 'Maradi', 'Zinder', 'Tahoua', 'Dosso', 'Tillabéri', 'Agadez', 'Diffa']
    for region in regions:
        if region.lower() in title_lower:
            return region
    return 'Niger'

def estimate_category(title, default_category):
    """Catégorise l'article selon des mots-clés présents dans le titre."""
    t = title.lower()
    if any(k in t for k in ["appel d'offres", "marché public", "avis d'attribution", "soumission"]):
        return "Marchés publics"
    if any(k in t for k in ["santé", "hôpital", "vaccin", "épidémie", "maladie", "polio"]):
        return "Santé"
    if any(k in t for k in ["pluie", "météo", "climat", "inondation", "sécheresse", "tempête"]):
        return "Météo"
    if any(k in t for k in ["agriculture", "semence", "élevage", "bétail", "mil ", "céréale"]):
        return "Agriculture"
    if any(k in t for k in ["budget", "finance", "économie", "banque", "bceao", "fmi", "inflation"]):
        return "Économie"
    if any(k in t for k in ["école", "université", "éducation", "classe", "scolaire"]):
        return "Éducation"
    if any(k in t for k in ["humanitaire", "déplacés", "nutrition", "réfugiés", "aide alimentaire", "ocha"]):
        return "Humanitaire"
    if any(k in t for k in ["sécurité", "militaire", "attaque", "défense", "soldat", "terrorisme"]):
        return "Sécurité"
    if any(k in t for k in ["communiqué officiel", "conseil des ministres", "décret", "gouvernement"]):
        return "Gouvernement"
    if any(k in t for k in ["diaspora", "ambassade", "consulat"]):
        return "Diaspora"
    return default_category

def estimate_importance(title, source_name, category):
    """Estime le degré d'importance de l'article (1 à 5)."""
    t = title.lower()
    if any(k in t for k in ["urgent", "alerte rouge", "inondation majeure", "attaque terroriste", "coup d'état"]):
        return 5
    if any(k in t for k in ["communiqué", "décret", "alerte", "sécurité", "conseil des ministres"]):
        return 4
    if category == "Gouvernement" or category == "Marchés publics" or "présidence" in source_name.lower() or "gouvernement" in source_name.lower():
        return 3
    return 2

def scrape_source(source, index, total_sources, old_news_by_id):
    """Analyse une source unique pour extraire les actualités et les images."""
    if source.get('status') != 'active':
        print(f"[Source {index}/{total_sources}] Ignorée : {source['name']} (inactive)")
        return []

    print(f"[Source {index}/{total_sources}] Début de l'analyse : {source['name']} ({source['url']})")
    
    collected_items = []
    try:
        html = fetch_html(source['url'])
        soup = BeautifulSoup(html, 'html.parser')
        source_items = []
        
        # Analyser toutes les balises <a>
        for link in soup.find_all('a'):
            href = link.get('href')
            text = ' '.join(link.get_text().split()).strip()
            
            if not href or not text:
                continue
            if len(text) < MIN_TITLE_LENGTH:
                continue
                
            text_lower = text.lower()
            blacklist = [
                'accueil', 'contact', 'menu', 'facebook', 'twitter', 'linkedin', 'instagram', 'youtube',
                'lire plus', 'lire l\'article', 'read more', 'connexion', 's\'abonner', 'newsletter',
                'partager', 'télécharger', 'mentions légales', 'politique de confidentialité', 'qui sommes-nous'
            ]
            if any(text_lower.startswith(b) or text_lower == b for b in blacklist):
                continue
                
            if href.startswith('mailto:') or href.startswith('tel:') or href.startswith('javascript:') or href.startswith('#'):
                continue
                
            # Résoudre l'URL absolue
            absolute_url = urllib.parse.urljoin(source['url'], href)
            
            # Tenter d'extraire une image associée
            image_url = ""
            img_tag = link.find('img')
            image_url = image_from_tag(img_tag, source['url'])

            if not image_url:
                card = link.find_parent(['article', 'li'])
                if not card:
                    card = link.find_parent(class_=['card', 'post', 'news-item', 'item', 'entry'])
                if card:
                    image_url = image_from_tag(card.find('img'), source['url'])
                    
            source_items.append({
                'title': text,
                'url': absolute_url,
                'image_url': image_url
            })
            
        # Dédupliquer les liens sur la même page
        unique_items = []
        seen_urls = set()
        for item in source_items:
            if item['url'] not in seen_urls:
                seen_urls.add(item['url'])
                unique_items.append(item)
                
        # Limiter par source
        selected_items = unique_items[:MAX_ITEMS_PER_SOURCE]

        for item in [entry for entry in selected_items if not entry['image_url']][:IMAGE_ENRICH_LIMIT_PER_SOURCE]:
            try:
                article_html = fetch_html(item['url'])
                item['image_url'] = extract_page_image(article_html, item['url'])
            except Exception:
                # Une image indisponible ne doit pas bloquer l'article.
                pass

        print(f"[Source {index}/{total_sources}] -> {len(selected_items)} liens trouvés pour {source['name']}")
        
        now_str = datetime.now(timezone(timedelta(hours=1))).isoformat()
        for item in selected_items:
            news_id = generate_news_id(source['name'], item['title'], item['url'])
            region = detect_region(item['title'])
            category = estimate_category(item['title'], source['category'])
            importance = estimate_importance(item['title'], source['name'], category)
            summary = f"Cette information a été repérée depuis {source['name']}. Elle concerne : {item['title']}. Consultez la source originale pour lire le contenu complet."
            previous_item = old_news_by_id.get(news_id, {})
            
            collected_items.append({
                "id": news_id,
                "title": item['title'],
                "summary": summary,
                "sourceName": source['name'],
                "sourceUrl": item['url'],
                "sourceHome": source['url'],
                "category": category,
                "publishedAt": previous_item.get('publishedAt', now_str),
                "collectedAt": now_str,
                "imageUrl": item['image_url'] or previous_item.get('imageUrl', ''),
                "tags": ["Niger", region, category],
                "region": region,
                "importance": importance,
                "isSample": False
            })
            
        # Marquer la source comme vérifiée
        source['lastChecked'] = now_str
        
    except Exception as e:
        print(f"[Source {index}/{total_sources}] [Erreur] Échec pour {source['name']} : {str(e)}")
        
    return collected_items

def generate_rss_feed(news_items):
    """Génère un flux RSS 2.0 valide contenant les 50 actualités les plus récentes."""
    rss_path = os.path.join(BASE_DIR, '../data/rss.xml')
    items_xml = []
    
    for item in news_items[:50]:
        pub_date = item['publishedAt']
        try:
            # Essayer de formater en RFC 822 pour la compatibilité RSS
            dt = datetime.fromisoformat(pub_date.replace('Z', '+00:00'))
            pub_date_formatted = dt.strftime('%a, %d %b %Y %H:%M:%S %z')
        except Exception:
            pub_date_formatted = pub_date
            
        items_xml.append(f"""    <item>
      <title><![CDATA[{item['title']}]]></title>
      <link>{item['sourceUrl']}</link>
      <guid isPermaLink="false">{item['id']}</guid>
      <pubDate>{pub_date_formatted}</pubDate>
      <description><![CDATA[{item['summary']}]]></description>
      <source url="{item['sourceHome']}">{item['sourceName']}</source>
      <category>{item['category']}</category>
    </item>""")
        
    rss_content = f"""<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Niger Info Veille - Flux RSS</title>
  <link>https://issou2025.github.io/nigerinfo/</link>
  <description>Flux d'actualités et de communiqués officiels sur le Niger.</description>
  <language>fr</language>
  <lastBuildDate>{datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0100')}</lastBuildDate>
  <atom:link href="https://issou2025.github.io/nigerinfo/data/rss.xml" rel="self" type="application/rss+xml" />
{chr(10).join(items_xml)}
</channel>
</rss>"""
    
    with open(rss_path, 'w', encoding='utf-8') as f:
        f.write(rss_content)
    print("Flux RSS statique généré avec succès dans data/rss.xml")

def collect():
    """Charge les sources, exécute le scan multi-threadé, fusionne et écrit les résultats."""
    print("=== DÉBUT DE LA COLLECTE NIGER INFO VEILLE (PYTHON ENGINE) ===")
    
    if not os.path.exists(PATH_SOURCES):
        print(f"Fichier sources.json introuvable à : {PATH_SOURCES}")
        sys.exit(1)
        
    with open(PATH_SOURCES, 'r', encoding='utf-8') as f:
        sources = json.load(f)
    print(f"{len(sources)} sources chargées.")
    
    old_news = []
    if os.path.exists(PATH_NEWS):
        try:
            with open(PATH_NEWS, 'r', encoding='utf-8') as f:
                old_news = json.load(f)
        except Exception:
            old_news = []
    print(f"{len(old_news)} articles actuellement en cache local.")
    old_news_by_id = {item['id']: item for item in old_news}
    
    collected_news = []
    total_sources = len(sources)
    
    # Exécuter les requêtes en parallèle (ThreadPoolExecutor) pour un scan très rapide
    with ThreadPoolExecutor(max_workers=CONCURRENCY_LIMIT) as executor:
        futures = {
            executor.submit(scrape_source, src, idx + 1, total_sources, old_news_by_id): src
            for idx, src in enumerate(sources)
        }
        for future in as_completed(futures):
            results = future.result()
            if results:
                collected_news.extend(results)
                
    # Fusionner et dédupliquer
    merged_news = collected_news + old_news
    final_news = []
    seen_ids = set()
    for item in merged_news:
        if item['id'] not in seen_ids:
            seen_ids.add(item['id'])
            final_news.append(item)
            
    # Trier par date décroissante
    final_news.sort(key=lambda x: x['publishedAt'], reverse=True)
    
    # Tranchage
    truncated_news = final_news[:MAX_TOTAL_ITEMS]
    
    # Compter les sources vérifiées avec succès
    successful_sources = sum(1 for src in sources if src.get('lastChecked'))
    
    # Enregistrer
    try:
        with open(PATH_NEWS, 'w', encoding='utf-8') as f:
            json.dump(truncated_news, f, ensure_ascii=False, indent=2)
        with open(PATH_SOURCES, 'w', encoding='utf-8') as f:
            json.dump(sources, f, ensure_ascii=False, indent=2)
            
        # Générer le flux RSS statique
        generate_rss_feed(truncated_news)
            
        print('\n=== RAPPORT DE COLLECTE PYTHON ===')
        print(f"- Sources scannées avec succès : {successful_sources}/{total_sources}")
        print(f"- Nouveaux articles récoltés lors de cette passe : {len(collected_news)}")
        print(f"- Total articles dans le fichier news.json : {len(truncated_news)}")
        print('=============================================')
    except Exception as e:
        print(f"Erreur d'écriture des fichiers : {str(e)}")

if __name__ == '__main__':
    # Gestion du mode démon
    if '--daemon' in sys.argv:
        interval_seconds = 15
        print(f"[Mode Démon Python] Démarrage de la veille en continu (toutes les {interval_seconds}s)...")
        while True:
            collect()
            time.sleep(interval_seconds)
    else:
        collect()
