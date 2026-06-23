/**
 * Niger Info Veille - Point d'entrée principal (Orchestration)
 */

const App = {
  newsData: [],
  sourcesData: [],
  filteredNews: [],
  
  // Pagination
  currentPage: 1,
  itemsPerPage: 12,

  /**
   * Initialise l'application au chargement de la page.
   */
  async init() {
    console.log('Initialisation de Niger Info Veille...');
    
    // 1. Initialiser le thème (mode clair/sombre)
    Theme.initTheme();

    // 2. Lier les événements d'interface globaux
    this.bindGlobalEvents();

    // 3. Charger les données depuis les fichiers JSON locaux
    await this.loadData();

    // 4. Démarrer l'actualisation automatique toutes les 15 secondes
    this.startAutoRefresh();
  },

  /**
   * Actualisation automatique en arrière-plan sans recharger toute la page.
   */
  startAutoRefresh() {
    setInterval(async () => {
      try {
        const cacheBust = `?t=${new Date().getTime()}`;
        const newsResponse = await fetch(`data/news.json${cacheBust}`, { cache: 'no-store' });
        if (!newsResponse.ok) return;
        const newNewsData = await newsResponse.json();
        if (!Array.isArray(newNewsData)) return;
        
        // Détecter les nouveaux articles mais aussi les images ou métadonnées enrichies.
        const createFingerprint = items => items
          .map(n => `${n.id}|${n.imageUrl || ''}|${n.publishedAt || ''}|${n.importance || ''}`)
          .join(',');
        const newIds = createFingerprint(newNewsData);
        const oldIds = createFingerprint(this.newsData);
        
        if (newIds !== oldIds) {
          console.log('Mise à jour en direct détectée...');
          this.newsData = Utils.sortNews(newNewsData, 'recent');
          
          // Rafraîchir les filtres et les statistiques
          Search.applyFilters();
          Render.renderStats(this.newsData, this.sourcesData);
          Render.renderAlertBanner(this.newsData);
          Render.updateLastUpdated();
          
          Utils.showToast('Flux d\'actualités mis à jour en direct !', 'info');
        }
      } catch (e) {
        // Erreur de polling ignorée silencieusement
      }
    }, 15000);
  },

  /**
   * Lie les écouteurs d'événements globaux pour la page (Boutons hors cartes).
   */
  bindGlobalEvents() {
    // Bouton de bascule de thème
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.onclick = () => Theme.toggleTheme();
    }

    // Menu burger pour mobile
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const headerNav = document.getElementById('header-nav');
    if (menuToggleBtn && headerNav) {
      const closeMobileMenu = () => {
        headerNav.classList.remove('mobile-open');
        document.body.classList.remove('menu-open');
        menuToggleBtn.innerHTML = '☰';
        menuToggleBtn.setAttribute('aria-expanded', 'false');
        menuToggleBtn.setAttribute('aria-label', 'Ouvrir le menu de navigation');
      };

      menuToggleBtn.onclick = () => {
        headerNav.classList.toggle('mobile-open');
        const isOpen = headerNav.classList.contains('mobile-open');
        document.body.classList.toggle('menu-open', isOpen);
        menuToggleBtn.innerHTML = isOpen ? '✕' : '☰';
        menuToggleBtn.setAttribute('aria-expanded', String(isOpen));
        menuToggleBtn.setAttribute('aria-label', isOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation');
      };

      // Fermer le menu sur clic d'un lien (mobile)
      headerNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeMobileMenu);
      });

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMobileMenu();
      });

      window.addEventListener('resize', () => {
        if (window.innerWidth > 1450) closeMobileMenu();
      });
    }

    // Bouton Charger Plus
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.onclick = () => this.loadMore();
    }

    // Bouton Actualiser les données
    const refreshDataBtn = document.getElementById('btn-refresh-data');
    if (refreshDataBtn) {
      refreshDataBtn.onclick = async () => {
        refreshDataBtn.classList.add('loading');
        Utils.showToast('Rechargement des données...', 'info');
        await this.loadData(true);
        refreshDataBtn.classList.remove('loading');
      };
    }
  },

  /**
   * Charge les données depuis news.json et sources.json.
   */
  async loadData(isManualRefresh = false) {
    // Afficher le skeleton loading
    Render.renderSkeleton('news-grid', 6);
    
    try {
      // Pour éviter les problèmes de cache lors des rafraîchissements
      const cacheBust = `?t=${new Date().getTime()}`;
      
      const newsResponse = await fetch(`data/news.json${cacheBust}`, { cache: 'no-store' });
      if (!newsResponse.ok) throw new Error('Impossible de charger data/news.json');
      this.newsData = await newsResponse.json();

      const sourcesResponse = await fetch(`data/sources.json${cacheBust}`, { cache: 'no-store' });
      if (!sourcesResponse.ok) throw new Error('Impossible de charger data/sources.json');
      this.sourcesData = await sourcesResponse.json();

      // Vérification que les données sont bien des tableaux
      if (!Array.isArray(this.newsData) || !Array.isArray(this.sourcesData)) {
        throw new Error('Format de données invalide.');
      }

      // Initialiser la recherche avec les sources chargées
      Search.initializeFilters(this.sourcesData);

      // Par défaut, trier les actualités par date décroissante
      this.newsData = Utils.sortNews(this.newsData, 'recent');
      this.filteredNews = [...this.newsData];

      // Mettre à jour les statistiques
      Render.renderStats(this.newsData, this.sourcesData);
      Render.renderAlertBanner(this.newsData);
      
      // Remplir les sections de sources et catégories statiques
      Render.renderSources(this.sourcesData);

      // Réinitialiser la pagination et afficher
      this.currentPage = 1;
      this.renderCurrentState();

      // Mettre à jour la date d'actualisation locale
      Render.updateLastUpdated();

      if (isManualRefresh) {
        Utils.showToast('Données actualisées avec succès !', 'success');
      }

    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      Utils.showToast('Erreur de chargement des données. Veuillez vérifier la connexion.', 'error');
      
      // Afficher un état vide ou d'erreur
      const newsGrid = document.getElementById('news-grid');
      if (newsGrid) {
        newsGrid.innerHTML = `
          <div class="empty-state error-state">
            <span class="empty-state-icon">⚠️</span>
            <h3 class="empty-state-title">Échec du chargement</h3>
            <p class="empty-state-text">Impossible de lire les fichiers de données locaux. Veuillez vous assurer que le site est hébergé ou lancé via un serveur local (ex: Python -m http.server).</p>
            <button class="btn btn-primary" onclick="App.loadData()" id="btn-retry-load">Réessayer</button>
          </div>
        `;
      }
    }
  },

  /**
   * Affiche la portion d'actualités correspondant à la page actuelle.
   */
  renderCurrentState() {
    const totalToShow = this.currentPage * this.itemsPerPage;
    const paginatedNews = this.filteredNews.slice(0, totalToShow);

    // Mettre à jour l'affichage
    Render.renderNewsList(paginatedNews, 'news-grid', false);

    // Gérer l'affichage du bouton Charger Plus
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (loadMoreBtn) {
      if (paginatedNews.length < this.filteredNews.length) {
        loadMoreBtn.style.display = 'block';
      } else {
        loadMoreBtn.style.display = 'none';
      }
    }
    
    // Mettre à jour le compteur de résultats
    const countEl = document.getElementById('results-count');
    if (countEl) {
      countEl.innerText = `${this.filteredNews.length} information${this.filteredNews.length > 1 ? 's' : ''} trouvée${this.filteredNews.length > 1 ? 's' : ''}`;
    }
  },

  /**
   * Incrémente la page et ajoute les actualités suivantes à la grille.
   */
  loadMore() {
    this.currentPage++;
    this.renderCurrentState();
    Utils.showToast('Articles supplémentaires chargés', 'info');
  },

  /**
   * Rafraîchit l'affichage actuel sans recharger les fichiers.
   */
  refreshUI() {
    this.renderCurrentState();
  }
};

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', () => App.init());
