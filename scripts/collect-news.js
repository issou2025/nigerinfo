/**
 * Niger Info Veille - Script de Collecte d'Actualités (Collector)
 * Exécuté par Node.js (GitHub Actions ou localement)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Charger Cheerio
let cheerio;
try {
  cheerio = require('cheerio');
} catch (e) {
  console.error("Erreur : La dépendance 'cheerio' n'est pas installée. Veuillez lancer 'npm install' dans le dossier scripts.");
  process.exit(1);
}

// Configuration
const USER_AGENT = "NigerInfoVeilleBot/1.0 (+contact@example.com)";
const MAX_ITEMS_PER_SOURCE = 10;
const MAX_TOTAL_ITEMS = 1000;
const MIN_TITLE_LENGTH = 30;
const TIMEOUT_MS = 10000; // 10 secondes
const IMAGE_ENRICH_LIMIT_PER_SOURCE = 6;

// Chemins des fichiers par rapport au script
const PATH_SOURCES = path.join(__dirname, '../data/sources.json');
const PATH_NEWS = path.join(__dirname, '../data/news.json');

// Utilitaire Sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Télécharge le contenu HTML d'une page Web avec redirection et timeout.
 */
function fetchHtml(urlStr, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 3) {
      return reject(new Error('Trop de redirections'));
    }

    let urlObj;
    try {
      urlObj = new URL(urlStr);
    } catch (e) {
      return reject(new Error(`URL invalide: ${urlStr}`));
    }

    const client = urlObj.protocol === 'https:' ? https : http;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
      },
      timeout: TIMEOUT_MS,
      rejectUnauthorized: false // Ignore les certificats SSL invalides/expirés
    };

    const req = client.get(options, (res) => {
      // Gérer les redirections (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, urlStr).toString();
        return resolve(fetchHtml(redirectUrl, depth + 1));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Statut HTTP: ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout de requête atteint'));
    });
  });
}

function normalizeImageUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  const candidate = rawUrl
    .split(',')
    .pop()
    .trim()
    .split(/\s+/)[0];

  if (!candidate || candidate.startsWith('data:') || candidate.startsWith('blob:')) return '';

  try {
    const absoluteUrl = new URL(candidate, baseUrl).toString();
    const lower = absoluteUrl.toLowerCase();
    const rejectedTokens = [
      'logo', 'icon', 'favicon', 'avatar', 'sprite', 'pixel', 'tracking',
      'facebook', 'twitter', 'instagram', 'youtube', 'whatsapp'
    ];
    if (rejectedTokens.some(token => lower.includes(token)) || lower.endsWith('.svg')) return '';
    return absoluteUrl;
  } catch (e) {
    return '';
  }
}

function imageFromElement($, img, baseUrl) {
  if (!img || !img.length) return '';
  const attributes = [
    'data-src', 'data-original', 'data-lazy-src', 'data-image',
    'data-srcset', 'srcset', 'src'
  ];

  for (const attribute of attributes) {
    const imageUrl = normalizeImageUrl(img.attr(attribute), baseUrl);
    if (imageUrl) return imageUrl;
  }
  return '';
}

function extractPageImage(html, pageUrl) {
  try {
    const $ = cheerio.load(html);
    const metaSelectors = [
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
      'link[rel="image_src"]'
    ];

    for (const selector of metaSelectors) {
      const element = $(selector).first();
      const imageUrl = normalizeImageUrl(element.attr('content') || element.attr('href'), pageUrl);
      if (imageUrl) return imageUrl;
    }

    const articleImage = $('article img, main img, .article img, .post img').first();
    return imageFromElement($, articleImage, pageUrl);
  } catch (e) {
    return '';
  }
}

/**
 * Génère un ID de news dédupliqué et prévisible.
 */
function generateNewsId(sourceName, title, url) {
  const hash = crypto.createHash('md5');
  hash.update(`${sourceName}-${title}-${url}`);
  return 'news-' + hash.digest('hex').substring(0, 12);
}

/**
 * Analyse le titre pour deviner la région concernée au Niger.
 */
function detectRegion(title) {
  const titleLower = title.toLowerCase();
  const regions = ['Niamey', 'Maradi', 'Zinder', 'Tahoua', 'Dosso', 'Tillabéri', 'Agadez', 'Diffa'];
  
  for (const region of regions) {
    if (titleLower.includes(region.toLowerCase())) {
      return region;
    }
  }
  return 'Niger';
}

/**
 * Estime la catégorie selon les mots-clés du titre.
 */
function estimateCategory(title, defaultCategory) {
  const t = title.toLowerCase();
  
  if (t.includes("appel d'offres") || t.includes("marché public") || t.includes("avis d'attribution") || t.includes("soumission")) {
    return "Marchés publics";
  }
  if (t.includes("santé") || t.includes("hôpital") || t.includes("vaccin") || t.includes("épidémie") || t.includes("maladie") || t.includes("polio")) {
    return "Santé";
  }
  if (t.includes("pluie") || t.includes("météo") || t.includes("climat") || t.includes("inondation") || t.includes("sécheresse") || t.includes("tempête")) {
    return "Météo";
  }
  if (t.includes("agriculture") || t.includes("semence") || t.includes("élevage") || t.includes("bétail") || t.includes("mil ") || t.includes("céréale")) {
    return "Agriculture";
  }
  if (t.includes("budget") || t.includes("finance") || t.includes("économie") || t.includes("banque") || t.includes("bceao") || t.includes("fmi") || t.includes("inflation")) {
    return "Économie";
  }
  if (t.includes("école") || t.includes("université") || t.includes("éducation") || t.includes("classe") || t.includes("scolaire")) {
    return "Éducation";
  }
  if (t.includes("humanitaire") || t.includes("déplacés") || t.includes("nutrition") || t.includes("réfugiés") || t.includes("aide alimentaire") || t.includes("ocha")) {
    return "Humanitaire";
  }
  if (t.includes("sécurité") || t.includes("militaire") || t.includes("attaque") || t.includes("défense") || t.includes("soldat") || t.includes("terrorisme")) {
    return "Sécurité";
  }
  if (t.includes("communiqué officiel") || t.includes("conseil des ministres") || t.includes("décret") || t.includes("gouvernement")) {
    return "Gouvernement";
  }
  if (t.includes("diaspora") || t.includes("ambassade") || t.includes("consulat")) {
    return "Diaspora";
  }
  
  return defaultCategory;
}

/**
 * Estime le score d'importance (1 à 5).
 */
function estimateImportance(title, sourceName, category) {
  const t = title.toLowerCase();
  
  // Critères de niveau 5 (Majeure)
  if (t.includes("urgent") || t.includes("alerte rouge") || t.includes("inondation majeure") || t.includes("attaque terroriste") || t.includes("coup d'état")) {
    return 5;
  }
  
  // Critères de niveau 4 (Très important)
  if (t.includes("communiqué") || t.includes("décret") || t.includes("alerte") || t.includes("sécurité") || t.includes("conseil des ministres")) {
    return 4;
  }
  
  // Critères de niveau 3 (Important)
  if (category === "Gouvernement" || category === "Marchés publics" || sourceName.includes("Présidence") || sourceName.includes("Gouvernement")) {
    return 3;
  }
  
  // Défaut
  return 2;
}

/**
 * Fonction principale du script de collecte.
 */
async function collect() {
  console.log('=== DÉBUT DE LA COLLECTE NIGER INFO VEILLE ===');
  const nowStr = new Date().toISOString();

  // 1. Lire les sources d'information
  if (!fs.existsSync(PATH_SOURCES)) {
    console.error(`Fichier des sources introuvable à : ${PATH_SOURCES}`);
    process.exit(1);
  }
  
  let sources = JSON.parse(fs.readFileSync(PATH_SOURCES, 'utf8'));
  console.log(`${sources.length} sources chargées.`);

  // 2. Lire les news actuelles pour fusion ultérieure
  let oldNews = [];
  if (fs.existsSync(PATH_NEWS)) {
    try {
      oldNews = JSON.parse(fs.readFileSync(PATH_NEWS, 'utf8'));
    } catch (e) {
      console.warn("Fichier news.json corrompu ou vide, réinitialisation.");
      oldNews = [];
    }
  }
  console.log(`${oldNews.length} articles actuellement en cache local.`);
  const oldNewsById = new Map(oldNews.map(item => [item.id, item]));

  const collectedNews = [];
  let successfulSourcesCount = 0;

  // Définition d'un worker individuel pour une source
  async function scrapeSource(source, index) {
    if (source.status !== 'active') {
      console.log(`[Source ${index}/${sources.length}] Ignorée : ${source.name} (inactive)`);
      return;
    }

    console.log(`[Source ${index}/${sources.length}] Début de l'analyse : ${source.name} (${source.url})`);
    
    try {
      const html = await fetchHtml(source.url);
      const $ = cheerio.load(html);
      const sourceItems = [];
      
      // Rechercher tous les liens dans la page
      $('a').each((idx, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().replace(/\s+/g, ' ').trim();

        if (!href || !text) return;
        if (text.length < MIN_TITLE_LENGTH) return;

        const textLower = text.toLowerCase();
        const blacklist = [
          'accueil', 'contact', 'menu', 'facebook', 'twitter', 'linkedin', 'instagram', 'youtube',
          'lire plus', 'lire l\'article', 'read more', 'connexion', 's\'abonner', 'newsletter',
          'partager', 'télécharger', 'mentions légales', 'politique de confidentialité', 'qui sommes-nous'
        ];
        if (blacklist.some(b => textLower === b || textLower.startsWith(b))) return;

        if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href.startsWith('#')) {
          return;
        }

        let absoluteUrl;
        try {
          absoluteUrl = new URL(href, source.url).toString();
        } catch (e) {
          return;
        }

        // Tenter d'extraire l'image depuis le lien ou le conteneur de carte.
        let imageUrl = '';
        const imgEl = $(el).find('img').first();
        if (imgEl.length > 0) {
          imageUrl = imageFromElement($, imgEl, source.url);
        }

        if (!imageUrl) {
          const card = $(el).closest('article, li, .card, .post, .news-item, .item, .entry');
          if (card.length > 0) {
            imageUrl = imageFromElement($, card.find('img').first(), source.url);
          }
        }

        sourceItems.push({
          title: text,
          url: absoluteUrl,
          imageUrl: imageUrl
        });
      });

      // Dédupliquer
      const uniqueSourceItems = [];
      const seenUrls = new Set();
      for (const item of sourceItems) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          uniqueSourceItems.push(item);
        }
      }

      const selectedItems = uniqueSourceItems.slice(0, MAX_ITEMS_PER_SOURCE);

      // Les pages d'accueil utilisent souvent des images en arrière-plan ou ne
      // publient l'image que dans les métadonnées Open Graph de l'article.
      const itemsToEnrich = selectedItems
        .filter(item => !item.imageUrl)
        .slice(0, IMAGE_ENRICH_LIMIT_PER_SOURCE);

      await Promise.all(itemsToEnrich.map(async item => {
        try {
          const articleHtml = await fetchHtml(item.url);
          item.imageUrl = extractPageImage(articleHtml, item.url);
        } catch (e) {
          // Une image absente ne doit jamais faire échouer la collecte.
        }
      }));

      console.log(`[Source ${index}/${sources.length}] -> ${selectedItems.length} liens trouvés pour ${source.name}`);

      selectedItems.forEach(item => {
        const id = generateNewsId(source.name, item.title, item.url);
        const region = detectRegion(item.title);
        const category = estimateCategory(item.title, source.category);
        const importance = estimateImportance(item.title, source.name, category);
        const summary = `Cette information a été repérée depuis ${source.name}. Elle concerne : ${item.title}. Consultez la source originale pour lire le contenu complet.`;
        const previousItem = oldNewsById.get(id);

        collectedNews.push({
          id: id,
          title: item.title,
          summary: summary,
          sourceName: source.name,
          sourceUrl: item.url,
          sourceHome: source.url,
          category: category,
          publishedAt: previousItem?.publishedAt || nowStr,
          collectedAt: nowStr,
          imageUrl: item.imageUrl || previousItem?.imageUrl || "",
          tags: ["Niger", region, category],
          region: region,
          importance: importance,
          isSample: false
        });
      });

      source.lastChecked = nowStr;
      successfulSourcesCount++;

    } catch (err) {
      console.error(`[Source ${index}/${sources.length}] [Erreur] Échec pour ${source.name} : ${err.message}`);
    }
  }

  // 3. Exécution concurrente par lots (Pool de Concurrence)
  // Utiliser une taille de lot (batch size) de 5 requêtes simultanées
  const CONCURRENCY_LIMIT = 5;
  for (let i = 0; i < sources.length; i += CONCURRENCY_LIMIT) {
    const chunk = sources.slice(i, i + CONCURRENCY_LIMIT);
    console.log(`\n--- Lancement du lot de sources [${i + 1} à ${Math.min(i + CONCURRENCY_LIMIT, sources.length)}] ---`);
    await Promise.all(chunk.map((src, indexInChunk) => scrapeSource(src, i + indexInChunk + 1)));
  }

  // 4. Fusionner les nouvelles collectées avec les anciennes
  // Prioriser les nouveaux éléments
  let mergedNews = [...collectedNews, ...oldNews];

  // Dédupliquer par ID global
  const finalNews = [];
  const seenIds = new Set();
  
  for (const item of mergedNews) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      finalNews.push(item);
    }
  }

  // Trier par date collectée / publiée décroissante
  finalNews.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // Limiter à 1000 éléments au total
  const truncatedNews = finalNews.slice(0, MAX_TOTAL_ITEMS);

  // 5. Sauvegarder les fichiers mis à jour
  try {
    // Si nous n'avons rien collecté de nouveau (ex : tout a échoué par absence de réseau dans l'environnement),
    // nous écrivons quand même les sources avec leurs états mis à jour, et nous laissons les news intactes.
    fs.writeFileSync(PATH_NEWS, JSON.stringify(truncatedNews, null, 2), 'utf8');
    fs.writeFileSync(PATH_SOURCES, JSON.stringify(sources, null, 2), 'utf8');
    
    console.log('\n=== RAPPORT DE COLLECTE ===');
    console.log(`- Sources vérifiées avec succès : ${successfulSourcesCount}/${sources.length}`);
    console.log(`- Nouveaux articles collectés lors de cette session : ${collectedNews.length}`);
    console.log(`- Nombre total d'articles stockés dans data/news.json : ${truncatedNews.length}`);
    console.log('=============================================');
  } catch (writeErr) {
    console.error('Erreur lors de l\'écriture des fichiers mis à jour:', writeErr);
  }
}

// Lancer la collecte
if (process.argv.includes('--daemon')) {
  const intervalSeconds = 15;
  console.log(`[Mode Démon] Démarrage de la veille en continu (toutes les ${intervalSeconds} secondes)...`);
  
  // Exécuter immédiatement
  collect();
  
  // Planifier le cycle
  setInterval(() => {
    collect();
  }, intervalSeconds * 1000);
} else {
  // Mode exécution unique (standard ou GitHub Actions)
  collect();
}
