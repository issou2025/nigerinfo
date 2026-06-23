/**
 * Niger Info Veille - Utilitaires
 * Contient les fonctions d'aide globales pour le formattage, la recherche et l'affichage.
 */

const Utils = {
  // Liste des mois en français
  MONTHS: [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ],

  /**
   * Formate une date ISO en chaîne lisible en français.
   * Exemple : "2026-06-23T10:00:00+01:00" -> "23 juin 2026 à 10:00"
   */
  formatDate(dateString) {
    if (!dateString) return 'Date inconnue';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Date invalide';
      
      const day = date.getDate();
      const month = this.MONTHS[date.getMonth()];
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${day} ${month} ${year} à ${hours}:${minutes}`;
    } catch (e) {
      console.error('Erreur de formatage de date:', e);
      return 'Date invalide';
    }
  },

  /**
   * Retourne une chaîne indiquant le temps écoulé depuis la date.
   * Exemple : "il y a 2 heures", "il y a 3 jours"
   */
  timeAgo(dateString) {
    if (!dateString) return 'il y a quelque temps';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      
      if (diffMs < 0) return "à l'instant";
      
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "à l'instant";
      if (diffMins < 60) return `il y a ${diffMins} min${diffMins > 1 ? 's' : ''}`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
      
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
      
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 4) return `il y a ${diffWeeks} semaine${diffWeeks > 1 ? 's' : ''}`;
      
      const diffMonths = Math.floor(diffDays / 30);
      if (diffMonths < 12) return `il y a ${diffMonths} mois`;
      
      const diffYears = Math.floor(diffDays / 365);
      return `il y a ${diffYears} an${diffYears > 1 ? 's' : ''}`;
    } catch (e) {
      return 'il y a quelque temps';
    }
  },

  /**
   * Vérifie si une date remonte à moins de 24 heures.
   */
  isRecent(dateString) {
    if (!dateString) return false;
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = diffMs / 3600000;
      return diffHours >= 0 && diffHours < 24;
    } catch (e) {
      return false;
    }
  },

  /**
   * Normalise un texte (supprime les accents et convertit en minuscule)
   * utile pour des recherches insensibles aux accents et à la casse.
   */
  normalizeText(text) {
    if (!text) return '';
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  },

  /**
   * Crée un slug à partir d'un texte.
   */
  createSlug(text) {
    return this.normalizeText(text)
      .trim()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  },

  /**
   * Renvoie le nom de la classe CSS pour la catégorie.
   */
  getCategoryColor(category) {
    const cat = this.normalizeText(category);
    if (cat.includes('gouv') || cat.includes('officiel')) return 'cat-gouvernement';
    if (cat.includes('econ') || cat.includes('budg') || cat.includes('fina')) return 'cat-economie';
    if (cat.includes('march') || cat.includes('offr')) return 'cat-marches';
    if (cat.includes('sant')) return 'cat-sante';
    if (cat.includes('agri') || cat.includes('elev') || cat.includes('cultu') || cat.includes('fao')) return 'cat-agriculture';
    if (cat.includes('meteo') || cat.includes('clim') || cat.includes('inond')) return 'cat-meteo';
    if (cat.includes('huma') || cat.includes('aide') || cat.includes('relief')) return 'cat-humanitaire';
    if (cat.includes('diasp')) return 'cat-diaspora';
    if (cat.includes('secu') || cat.includes('mili') || cat.includes('defe')) return 'cat-securite';
    if (cat.includes('educ') || cat.includes('scol') || cat.includes('univ')) return 'cat-education';
    return 'cat-default';
  },

  /**
   * Tronce un texte à une longueur donnée en ajoutant "...".
   */
  truncateText(text, maxLength = 120) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  },

  /**
   * Échappe une valeur avant son insertion dans du HTML généré.
   */
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * N'autorise que les URL Web utilisables par les cartes.
   */
  safeUrl(value, fallback = '#') {
    if (!value) return fallback;
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch (e) {
      return fallback;
    }
  },

  /**
   * Groupe un tableau d'objets par une clé.
   */
  groupBy(array, key) {
    return array.reduce((result, currentValue) => {
      const groupKey = currentValue[key];
      (result[groupKey] = result[groupKey] || []).push(currentValue);
      return result;
    }, {});
  },

  /**
   * Compte les occurrences d'une clé dans un tableau d'objets.
   */
  countBy(array, key) {
    return array.reduce((result, currentValue) => {
      const groupKey = currentValue[key];
      result[groupKey] = (result[groupKey] || 0) + 1;
      return result;
    }, {});
  },

  /**
   * Trie les actualités selon le mode.
   */
  sortNews(news, sortMode) {
    const sorted = [...news];
    switch (sortMode) {
      case 'recent':
        return sorted.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      case 'ancien':
        return sorted.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
      case 'source':
        return sorted.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
      case 'category':
        return sorted.sort((a, b) => a.category.localeCompare(b.category));
      case 'importance':
        return sorted.sort((a, b) => b.importance - a.importance);
      default:
        return sorted.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    }
  },

  /**
   * Génère le lien de partage WhatsApp.
   */
  generateWhatsAppLink(newsItem) {
    const title = newsItem.title;
    const url = newsItem.sourceUrl;
    const text = `${title} - Lire l'article sur sa source d'origine: ${url} (via Niger Info Veille)`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  },

  /**
   * Copie un texte dans le presse-papiers et affiche un message.
   */
  async copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error('Erreur presse-papier direct:', err);
      }
    }
    // Fallback pour anciens navigateurs ou contextes non sécurisés
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Échec de la copie de secours:', err);
      return false;
    }
  },

  /**
   * Affiche un message d'alerte (Toast) moderne à l'écran.
   */
  showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icone simple
    let icon = '🔔';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'info') icon = 'ℹ️';

    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Déclencher l'animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Supprimer après 3 secondes
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, 300);
    }, 3000);
  },

  // Références vocales
  activeSpeakerBtn: null,

  /**
   * Lit un texte à haute voix (Synthèse Vocale) en français.
   */
  speakText(text, btnElement) {
    if (!('speechSynthesis' in window)) {
      this.showToast("La synthèse vocale n'est pas supportée.", "error");
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (this.activeSpeakerBtn) {
        this.activeSpeakerBtn.innerHTML = '🔊 Écouter';
        this.activeSpeakerBtn.classList.remove('speaking');
      }
      if (this.activeSpeakerBtn === btnElement) {
        this.activeSpeakerBtn = null;
        this.showToast("Lecture audio arrêtée", "info");
        return;
      }
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      
      utterance.onend = () => {
        btnElement.innerHTML = '🔊 Écouter';
        btnElement.classList.remove('speaking');
        this.activeSpeakerBtn = null;
      };
      
      utterance.onerror = () => {
        btnElement.innerHTML = '🔊 Écouter';
        btnElement.classList.remove('speaking');
        this.activeSpeakerBtn = null;
      };

      btnElement.innerHTML = '🛑 Arrêter';
      btnElement.classList.add('speaking');
      this.activeSpeakerBtn = btnElement;
      
      window.speechSynthesis.speak(utterance);
      this.showToast("Lecture de l'article...", "info");
    } catch (e) {
      this.showToast("Erreur de synthèse vocale.", "error");
    }
  }
};
