class GrabText {
    constructor() {
        this.notes = [];
        this.activeTag = 'all';
        this.currentNote = null;
        this.pendingImage = null;

        this.init();
    }

    async init() {
        this.loadTheme();
        await this.loadData();
        this.bindEvents();
        this.render();
        this.listenForAreaCapture();
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('grabtext-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('grabtext-theme', newTheme);
    }

    async loadData() {
        const data = await chrome.storage.local.get(['notes']);
        this.notes = data.notes || [];
    }

    async saveNotes() {
        await chrome.storage.local.set({ notes: this.notes });
    }

    bindEvents() {
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('captureBtn').addEventListener('click', () => this.captureScreen());
        document.getElementById('selectAreaBtn').addEventListener('click', () => this.startAreaSelection());

        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.renderNotes(e.target.value);
        });

        document.getElementById('profileBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('profileMenu').classList.toggle('active');
        });

        document.getElementById('exportAllBtn').addEventListener('click', () => {
            this.exportNotes();
            document.getElementById('profileMenu').classList.remove('active');
        });

        document.addEventListener('click', () => {
            document.getElementById('profileMenu').classList.remove('active');
        });

        document.getElementById('closeNewNote').addEventListener('click', () => this.closeNewNoteModal());
        document.getElementById('cancelNewNote').addEventListener('click', () => this.closeNewNoteModal());
        document.getElementById('saveNewNote').addEventListener('click', () => this.saveNewNote());

        document.getElementById('closeNote').addEventListener('click', () => {
            document.getElementById('noteModal').classList.remove('active');
            this.currentNote = null;
        });

        document.getElementById('deleteNote').addEventListener('click', () => {
            if (this.currentNote) {
                this.deleteNote(this.currentNote);
            }
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    listenForAreaCapture() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'areaCaptured') {
                this.handleAreaCaptured(request.dataUrl);
            }
            if (request.action === 'captureError') {
                this.showLoading(false);
                this.showToast(request.error || 'Bir hata oluştu', 'error');
            }
            if (request.action === 'selectionCancelled') {
                this.showLoading(false);
            }
        });
    }

    async startAreaSelection() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'startSelection' });

            if (!response.success) {
                throw new Error(response.error);
            }

            this.showToast('Alanı seçmek için sürükleyin', 'info');

        } catch (error) {
            console.error('Alan seçimi hatası:', error);
            this.showToast(error.message || 'Alan seçimi başlatılamadı', 'error');
        }
    }

    async handleAreaCaptured(dataUrl) {
        this.pendingImage = dataUrl;

        document.getElementById('previewImage').src = this.pendingImage;
        document.getElementById('noteTitleInput').value = '';
        document.getElementById('tagsInput').value = '';
        document.getElementById('extractedText').value = '';

        document.getElementById('newNoteModal').classList.add('active');

        this.showLoading(true, 'Metin çıkarılıyor...');
        await this.extractText(this.pendingImage);
    }

    async captureScreen() {
        this.showLoading(true, 'Ekran görüntüsü alınıyor...');

        try {
            const captureResponse = await chrome.runtime.sendMessage({ action: 'captureScreen' });

            if (!captureResponse.success) {
                throw new Error(captureResponse.error);
            }

            this.pendingImage = captureResponse.dataUrl;

            document.getElementById('previewImage').src = this.pendingImage;
            document.getElementById('noteTitleInput').value = '';
            document.getElementById('tagsInput').value = '';
            document.getElementById('extractedText').value = '';

            document.getElementById('newNoteModal').classList.add('active');

            this.showLoading(true, 'Metin çıkarılıyor...');
            await this.extractText(this.pendingImage);

        } catch (error) {
            console.error('Yakalama hatası:', error);
            this.showToast(error.message || 'Bir hata oluştu', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async extractText(imageDataUrl) {
        try {
            const result = await Tesseract.recognize(
                imageDataUrl,
                'tur+eng',
                {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            const percent = Math.round(m.progress * 100);
                            document.getElementById('loadingText').textContent = `Metin çıkarılıyor... %${percent}`;
                        }
                    }
                }
            );

            document.getElementById('extractedText').value = result.data.text.trim();
            this.showLoading(false);

        } catch (error) {
            console.error('OCR hatası:', error);
            document.getElementById('extractedText').value = 'Metin çıkarılamadı';
            this.showLoading(false);
        }
    }

    async saveNewNote() {
        const title = document.getElementById('noteTitleInput').value.trim();
        const content = document.getElementById('extractedText').value.trim();
        const tagsString = document.getElementById('tagsInput').value.trim();

        if (!title) {
            this.showToast('Lütfen bir başlık girin', 'error');
            return;
        }

        const tags = tagsString
            ? tagsString.split(',').map(t => t.trim()).filter(t => t)
            : ['genel'];

        const note = {
            id: Date.now().toString(),
            imageUrl: this.pendingImage,
            title: title,
            content: content,
            tags: tags,
            createdAt: new Date().toISOString()
        };

        this.notes.unshift(note);
        await this.saveNotes();

        this.closeNewNoteModal();
        this.render();
        this.showToast('Not başarıyla kaydedildi', 'success');
    }

    exportNotes() {
        if (this.notes.length === 0) {
            this.showToast('Dışa aktarılacak not yok', 'error');
            return;
        }

        const exportData = this.notes.map(note => ({
            title: note.title,
            content: note.content,
            tags: note.tags,
            createdAt: note.createdAt
        }));

        const content = JSON.stringify(exportData, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'grabtext_notlar.json';
        a.click();
        URL.revokeObjectURL(url);

        this.showToast(`${this.notes.length} not dışa aktarıldı`, 'success');
    }

    closeNewNoteModal() {
        document.getElementById('newNoteModal').classList.remove('active');
        this.pendingImage = null;
    }

    async deleteNote(noteId) {
        const index = this.notes.findIndex(n => n.id === noteId);
        if (index > -1) {
            this.notes.splice(index, 1);
            await this.saveNotes();

            document.getElementById('noteModal').classList.remove('active');
            this.currentNote = null;

            this.render();
            this.showToast('Not silindi', 'success');
        }
    }

    filterByTag(tag) {
        this.activeTag = tag;

        document.querySelectorAll('.tags-container .tag').forEach(el => {
            el.classList.toggle('active', el.dataset.tag === tag);
        });

        this.renderNotes();
    }

    render() {
        this.renderTags();
        this.renderNotes();
    }

    renderTags() {
        const container = document.getElementById('tagsContainer');

        const allTags = new Set();
        this.notes.forEach(note => {
            note.tags?.forEach(tag => allTags.add(tag));
        });

        let html = `<button class="tag ${this.activeTag === 'all' ? 'active' : ''}" data-tag="all">Tümü</button>`;

        allTags.forEach(tag => {
            html += `<button class="tag ${this.activeTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</button>`;
        });

        container.innerHTML = html;

        container.querySelectorAll('.tag').forEach(el => {
            el.addEventListener('click', () => this.filterByTag(el.dataset.tag));
        });
    }

    renderNotes(searchQuery = '') {
        const container = document.getElementById('notesList');

        let emptyStateHtml = `
          <div class="empty-state" id="emptyState">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <p>Henüz not yok</p>
            <span>Ekran görüntüsü alarak ilk notunuzu oluşturun</span>
          </div>
        `;

        let filteredNotes = this.notes;

        if (this.activeTag !== 'all') {
            filteredNotes = filteredNotes.filter(note =>
                note.tags?.includes(this.activeTag)
            );
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredNotes = filteredNotes.filter(note =>
                note.title.toLowerCase().includes(query) ||
                note.content.toLowerCase().includes(query)
            );
        }

        if (filteredNotes.length === 0) {
            container.innerHTML = emptyStateHtml;
            return;
        }

        container.innerHTML = filteredNotes.map(note => `
      <div class="note-card" data-id="${note.id}">
        <img class="note-card-thumb" src="${note.imageUrl}" alt="">
        <div class="note-card-content">
          <div class="note-card-title">${this.escapeHtml(note.title)}</div>
          <div class="note-card-preview">${this.escapeHtml(note.content)}</div>
          <div class="note-card-meta">${this.formatDate(note.createdAt)}</div>
        </div>
      </div>
    `).join('');

        container.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('click', () => {
                const note = this.notes.find(n => n.id === card.dataset.id);
                if (note) this.showNoteDetail(note);
            });
        });
    }

    showNoteDetail(note) {
        this.currentNote = note.id;

        document.getElementById('noteTitle').textContent = note.title;
        document.getElementById('noteImage').src = note.imageUrl;
        document.getElementById('noteContent').textContent = note.content;
        document.getElementById('noteDate').textContent = this.formatDate(note.createdAt);

        const tagsContainer = document.getElementById('noteTags');
        tagsContainer.innerHTML = note.tags?.map(tag =>
            `<span class="tag">${tag}</span>`
        ).join('') || '';

        document.getElementById('noteModal').classList.add('active');
    }

    showLoading(show, text = 'Metin çıkarılıyor...') {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').classList.toggle('active', show);
    }

    showToast(message, type = 'info') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    formatDate(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Az önce';
        if (minutes < 60) return `${minutes} dakika önce`;
        if (hours < 24) return `${hours} saat önce`;
        if (days < 7) return `${days} gün önce`;

        return date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GrabText();
});
