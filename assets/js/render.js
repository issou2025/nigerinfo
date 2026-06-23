/**
 * Niger Info Veille - Rendu du DOM (UI)
 */

const Render = {
  /**
   * Génère le code HTML pour une carte d'actualité.
   */
  renderNewsCard(newsItem) {
    const isNew = Utils.isRecent(newsItem.publishedAt);
    const isSaved = Bookmarks.isBookmarked(newsItem.id);
    const catClass = Utils.getCategoryColor(newsItem.category);
    const timeAgoText = Utils.timeAgo(newsItem.publishedAt);
    const dateFormatted = Utils.formatDate(newsItem.publishedAt);
    const collectedAgoText = Utils.timeAgo(newsItem.collectedAt);
    
    const placeholder = 'assets/img/placeholder-news.svg';
    const imageSrc = Utils.safeUrl(newsItem.imageUrl, placeholder);
    const sourceUrl = Utils.safeUrl(newsItem.sourceUrl, '#');
    const id = Utils.escapeHtml(newsItem.id);
    const title = Utils.escapeHtml(newsItem.title || 'Information sans titre');
    const summary = Utils.escapeHtml(Utils.truncateText(newsItem.summary, 140));
    const category = Utils.escapeHtml(newsItem.category || 'Actualités');
    const sourceName = Utils.escapeHtml(newsItem.sourceName || 'Source');
    const region = Utils.escapeHtml(newsItem.region || '');
    
    // Importance styling (bords colorés ou icônes selon importance)
    let importanceBadge = '';
    if (newsItem.importance >= 4) {
      const label = newsItem.importance === 5 ? 'Majeure' : 'Très Importante';
      const cssClass = newsItem.importance === 5 ? 'importance-5' : 'importance-4';
      importanceBadge = `<span class="importance-badge ${cssClass}">${label}</span>`;
    }

    return `
      <article class="news-card ${newsItem.importance === 5 ? 'news-card-major' : ''}" data-id="${id}">
        <div class="news-card-image-container">
          <img src="${Utils.escapeHtml(imageSrc)}" alt="${title}" class="news-card-image" onload="this.classList.add('loaded')" onerror="this.onerror=null; this.src='${placeholder}'; this.classList.add('loaded', 'is-placeholder');" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          <div class="news-card-badges">
            <span class="badge ${catClass}">${category}</span>
            <span class="badge badge-source">${sourceName}</span>
          </div>
          ${isNew ? '<span class="badge badge-new">Nouveau</span>' : ''}
          ${importanceBadge}
        </div>
        
        <div class="news-card-content">
          <div class="news-card-meta">
            <span class="news-card-time" title="Publié le ${dateFormatted}">🕒 ${timeAgoText}</span>
            ${newsItem.region ? `<span class="news-card-region">📍 ${region}</span>` : ''}
          </div>
          
          <h3 class="news-card-title">${title}</h3>
          <p class="news-card-summary">${summary}</p>
          
          <div class="news-card-collect-date">
            <span>Collecté ${collectedAgoText}</span>
          </div>
          
          <div class="news-card-actions">
            <a href="${Utils.escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm btn-visit" id="btn-read-${id}">
              Lire la source ↗
            </a>
            <button class="btn btn-outline btn-sm btn-speak" data-id="${id}" title="Écouter le résumé de l'information">
              🔊 Écouter
            </button>
            <div class="news-card-utils">
              <button class="btn-util btn-bookmark ${isSaved ? 'active' : ''}" data-id="${id}" aria-label="Ajouter aux favoris" title="Enregistrer en favori">
                ${isSaved ? '❤️' : '🤍'}
              </button>
              <button class="btn-util btn-share-wa" data-id="${id}" aria-label="Partager sur WhatsApp" title="Partager sur WhatsApp">
                💬
              </button>
              <button class="btn-util btn-copy-link" data-id="${id}" data-url="${Utils.escapeHtml(sourceUrl)}" aria-label="Copier le lien" title="Copier le lien">
                🔗
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  },

  /**
   * Affiche la liste des actualités dans la grille principale.
   */
  renderNewsList(newsArray, containerId = 'news-grid', append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!append) {
      container.innerHTML = '';
    }

    if (newsArray.length === 0) {
      if (!append) this.renderEmptyState(containerId);
      return;
    }

    const cardsHtml = newsArray.map(item => this.renderNewsCard(item)).join('');
    
    if (append) {
      container.insertAdjacentHTML('beforeend', cardsHtml);
    } else {
      container.innerHTML = cardsHtml;
    }

    // Ré-attacher les écouteurs d'événements sur les boutons utilitaires
    this.attachCardEventListeners(container);
  },

  /**
   * Attache les écouteurs d'événements pour le partage, favoris et copie sur les cartes rendues.
   */
  attachCardEventListeners(container) {
    // Boutons favoris
    container.querySelectorAll('.btn-bookmark').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const isAdded = Bookmarks.toggleBookmark(id);
        
        btn.classList.toggle('active', isAdded);
        btn.innerHTML = isAdded ? '❤️' : '🤍';
        
        // Si l'utilisateur est en train de filtrer par favoris uniquement, rafraîchir l'affichage
        if (typeof Search !== 'undefined' && Search.filters.onlyBookmarked) {
          App.refreshUI();
        }
      };
    });

    // Boutons WhatsApp
    container.querySelectorAll('.btn-share-wa').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        if (typeof App !== 'undefined') {
          const item = App.newsData.find(n => n.id === id);
          if (item) {
            window.open(Utils.generateWhatsAppLink(item), '_blank');
          }
        }
      };
    });

    // Boutons Copie Lien
    container.querySelectorAll('.btn-copy-link').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const url = btn.getAttribute('data-url');
        const success = await Utils.copyToClipboard(url);
        if (success) {
          Utils.showToast('Lien copié dans le presse-papiers !', 'success');
        } else {
          Utils.showToast('Échec de la copie du lien.', 'error');
        }
      };
    });

    // Boutons de synthèse vocale (Text-to-Speech)
    container.querySelectorAll('.btn-speak').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        if (typeof App !== 'undefined') {
          const item = App.newsData.find(n => n.id === id);
          if (item) {
            // Lire à voix haute le titre et le résumé
            const speechText = `${item.title}. ${item.summary}`;
            Utils.speakText(speechText, btn);
          }
        }
      };
    });
  },

  /**
   * Affiche la liste des sources surveillées dans la section dédiée.
   */
  renderSources(sourcesArray, containerId = 'sources-grid') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (sourcesArray.length === 0) {
      container.innerHTML = '<p class="text-muted">Aucune source disponible.</p>';
      return;
    }

    container.innerHTML = sourcesArray.map(source => {
      const lastCheckedText = source.lastChecked ? Utils.timeAgo(source.lastChecked) : 'jamais';
      return `
        <div class="source-card">
          <div class="source-card-header">
            <h4 class="source-card-name">${source.name}</h4>
            <span class="badge badge-source-cat">${source.category}</span>
          </div>
          <p class="source-card-desc">${source.description || 'Pas de description fournie.'}</p>
          <div class="source-card-meta">
            <span class="source-status status-${source.status}">${source.status === 'active' ? '● En ligne' : '○ Inactif'}</span>
            <span class="source-checked">Vérifié : ${lastCheckedText}</span>
          </div>
          <a href="${source.url}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm source-card-btn" id="btn-source-visit-${source.id}">
            Visiter le site
          </a>
        </div>
      `;
    }).join('');
  },

  /**
   * Calcule et affiche les statistiques globales dans l'interface.
   */
  renderStats(newsArray, sourcesArray) {
    // 1. Nombre total d'informations collectées
    const totalNews = newsArray.length;
    const totalNewsEl = document.getElementById('stat-total-news');
    if (totalNewsEl) totalNewsEl.innerText = totalNews;

    // 2. Nombre de sources surveillées
    const totalSources = sourcesArray.length;
    const totalSourcesEl = document.getElementById('stat-total-sources');
    if (totalSourcesEl) totalSourcesEl.innerText = totalSources;

    // 3. Mises à jour aujourd'hui (depuis 24 heures)
    const newsToday = newsArray.filter(n => Utils.isRecent(n.publishedAt)).length;
    const newsTodayEl = document.getElementById('stat-news-today');
    if (newsTodayEl) newsTodayEl.innerText = newsToday;

    // 4. Dernière collecte (date la plus récente parmi collectedAt)
    let lastCollectText = 'Aucune';
    if (totalNews > 0) {
      const dates = newsArray.map(n => new Date(n.collectedAt).getTime());
      const maxDate = new Date(Math.max(...dates));
      lastCollectText = Utils.timeAgo(maxDate.toISOString());
    }
    const lastCollectEl = document.getElementById('stat-last-collect');
    if (lastCollectEl) lastCollectEl.innerText = lastCollectText;

    // Remplir aussi la sidebar
    this.renderSidebarStats(newsArray, sourcesArray, newsToday);
  },

  /**
   * Rendu des statistiques de la sidebar.
   */
  renderSidebarStats(newsArray, sourcesArray, newsToday) {
    // Catégorie populaire
    const categoryCounts = Utils.countBy(newsArray, 'category');
    let topCategory = 'Aucune';
    let maxCatCount = 0;
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > maxCatCount) {
        maxCatCount = count;
        topCategory = cat;
      }
    }
    const sidebarCatEl = document.getElementById('sidebar-popular-category');
    if (sidebarCatEl) sidebarCatEl.innerText = `${topCategory} (${maxCatCount} art.)`;

    // Source la plus active
    const sourceCounts = Utils.countBy(newsArray, 'sourceName');
    let topSource = 'Aucune';
    let maxSrcCount = 0;
    for (const [src, count] of Object.entries(sourceCounts)) {
      if (count > maxSrcCount) {
        maxSrcCount = count;
        topSource = src;
      }
    }
    const sidebarSrcEl = document.getElementById('sidebar-active-source');
    if (sidebarSrcEl) sidebarSrcEl.innerText = `${topSource} (${maxSrcCount} art.)`;

    // Articles aujourd'hui
    const sidebarTodayEl = document.getElementById('sidebar-today-count');
    if (sidebarTodayEl) sidebarTodayEl.innerText = newsToday;

    // Sources actives
    // Lister les sources triées par le nombre d'articles
    const sortedSourcesByActivity = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const activeSourcesListEl = document.getElementById('sidebar-active-sources-list');
    if (activeSourcesListEl) {
      if (sortedSourcesByActivity.length === 0) {
        activeSourcesListEl.innerHTML = '<li class="text-muted">Aucune donnée</li>';
      } else {
        activeSourcesListEl.innerHTML = sortedSourcesByActivity.map(([srcName, count]) => `
          <li>
            <span class="source-list-name">${srcName}</span>
            <span class="source-list-count">${count} articles</span>
          </li>
        `).join('');
      }
    }

    // Rendre le graphique analytique thématique dans la sidebar
    this.renderAnalytics(newsArray);
  },

  /**
   * Rendu graphique de l'analyse thématique dans la sidebar.
   */
  renderAnalytics(newsArray) {
    const container = document.getElementById('sidebar-analytics-chart');
    if (!container) return;

    if (newsArray.length === 0) {
      container.innerHTML = '<p class="text-muted">Aucune donnée à analyser.</p>';
      return;
    }

    // Compter les articles par catégorie
    const categoryCounts = Utils.countBy(newsArray, 'category');
    
    // Convertir en tableau pour trier par volume
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // top 5 catégories

    const totalNews = newsArray.length;

    // Générer le HTML
    container.innerHTML = sortedCategories.map(([category, count]) => {
      const percentage = Math.round((count / totalNews) * 100);
      return `
        <div class="analytics-bar-item">
          <div class="analytics-bar-label">
            <span>${category}</span>
            <span class="analytics-bar-count">${count} articles (${percentage}%)</span>
          </div>
          <div class="analytics-bar-wrapper">
            <div class="analytics-bar" style="width: ${percentage}%;"></div>
          </div>
        </div>
      `;
    }).join('');

    // Déclencher l'animation d'expansion des barres
    setTimeout(() => {
      container.querySelectorAll('.analytics-bar').forEach(bar => {
        const targetWidth = bar.style.width;
        bar.style.width = '0%';
        setTimeout(() => {
          bar.style.width = targetWidth;
        }, 50);
      });
    }, 100);
  },

  /**
   * Affiche l'état d'alerte critique en haut s'il y a des actualités d'importance 5.
   */
  renderAlertBanner(newsArray) {
    const alertBanner = document.getElementById('critical-alert-banner');
    if (!alertBanner) return;

    // Trouver l'information majeure (importance 5) la plus récente de moins de 24h
    const majorNews = newsArray
      .filter(n => n.importance === 5 && Utils.isRecent(n.publishedAt))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];

    if (majorNews) {
      alertBanner.innerHTML = `
        <div class="alert-banner-content container">
          <span class="alert-banner-badge">🚨 ALERTE</span>
          <span class="alert-banner-title">${Utils.escapeHtml(majorNews.title)}</span>
          <a href="${Utils.escapeHtml(Utils.safeUrl(majorNews.sourceUrl, '#'))}" target="_blank" rel="noopener noreferrer" class="alert-banner-link" id="btn-read-alert">Lire l'article original ↗</a>
        </div>
      `;
      alertBanner.classList.add('show');
    } else {
      alertBanner.classList.remove('show');
      alertBanner.innerHTML = '';
    }
  },

  /**
   * Rendu de l'état vide si aucun résultat n'est trouvé.
   */
  renderEmptyState(containerId = 'news-grid') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <h3 class="empty-state-title">Aucune information trouvée</h3>
        <p class="empty-state-text">Aucun article ne correspond à vos filtres de recherche. Essayez de modifier vos mots-clés ou de réinitialiser vos filtres.</p>
        <button class="btn btn-primary" onclick="Search.resetFilters()" id="btn-reset-empty">Réinitialiser les filtres</button>
      </div>
    `;
  },

  /**
   * Affiche le skeleton loading dans la grille principale.
   */
  renderSkeleton(containerId = 'news-grid', count = 6) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const skeletonsHtml = Array(count).fill(0).map(() => `
      <div class="skeleton-card">
        <div class="skeleton-image"></div>
        <div class="skeleton-body">
          <div class="skeleton-meta">
            <span class="skeleton-line skeleton-meta-line"></span>
          </div>
          <div class="skeleton-title"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-button"></div>
        </div>
      </div>
    `).join('');

    container.innerHTML = skeletonsHtml;
  },

  /**
   * Met à jour le label de dernière actualisation locale du navigateur.
   */
  updateLastUpdated() {
    const el = document.getElementById('local-updated-time');
    if (el) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      el.innerText = `${hours}:${minutes}:${seconds}`;
    }
  }
};
