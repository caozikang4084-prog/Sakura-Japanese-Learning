(() => {
  const MOBILE_MEDIA = '(max-width: 680px)';
  const mobileMedia = window.matchMedia
    ? window.matchMedia(MOBILE_MEDIA)
    : { matches: false };
  let activeWordId = '';

  function isMobileLayout() {
    return mobileMedia.matches || window.innerWidth <= 680;
  }

  function wordSheetMarkup(word) {
    const mastered = Boolean(state.words[word.id]);
    return `
      <section class="mobile-word-sheet" data-mobile-word-id="${esc(word.id)}">
        <header class="mobile-word-sheet-head">
          <div>
            <span>词汇学习卡片</span>
            <strong>${esc(word.word)}</strong>
          </div>
          <button class="mobile-sheet-close" type="button" data-action="mobile-word-close"
            aria-label="关闭词汇卡片">×</button>
        </header>
        <div class="mobile-word-sheet-body">
          <div class="detail-word">${esc(word.word)}</div>
          <div class="detail-kana">
            ${kanaPairMarkup(word.kana, 'detail', true)}
            <span class="detail-romaji">罗马音 · ${esc(word.romaji || romajiHint(word.kana, word.kana))}</span>
          </div>
          <div class="detail-meta-tags">
            <span class="word-badge">${esc(word.pos)}</span>
            <span class="word-badge level-badge">JLPT ${esc(word.level)}</span>
            ${themeBadges(word.themes)}
          </div>
          <div class="detail-label">中文释义</div>
          <div class="detail-meaning">${esc(word.meaning)}</div>
          <div class="detail-label">例句与学习卡片</div>
          <div class="example-list example-study-list">
            ${word.examples
              .map((example, index) =>
                renderExampleStudyCard(example, word.id, index),
              )
              .join('')}
          </div>
        </div>
        <footer class="mobile-word-sheet-actions">
          <button class="${mastered ? 'secondary-button' : 'primary-button'}" type="button"
            data-action="word-toggle" data-word-id="${word.id}">
            ${mastered ? '取消掌握' : '标记已掌握'}
          </button>
          <button class="small-button" type="button" data-action="speak"
            data-text="${esc(word.kana)}">朗读</button>
          <button class="small-button shadow-entry" type="button" data-action="shadow-open"
            data-shadow-text="${esc(word.word)}"
            data-shadow-audio-text="${esc(word.kana)}"
            data-shadow-reading="${esc(word.kana)}"
            data-shadow-has-reading="true"
            data-shadow-zh="${esc(word.meaning)}">跟读</button>
        </footer>
      </section>`;
  }

  function openMobileWordSheet(wordId) {
    const word = CONTENT_WORD_BY_ID[wordId];
    if (!word || !isMobileLayout()) return;
    activeWordId = word.id;
    ui.selectedWord = word.id;
    document.querySelectorAll('.word-row').forEach((row) => {
      row.classList.toggle('selected', row.dataset.wordId === word.id);
    });
    openModal(wordSheetMarkup(word));
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.classList.add('mobile-word-sheet-modal');
    modal.setAttribute('aria-label', `${word.word} 词汇学习卡片`);
    const sheet = modal.querySelector('.mobile-word-sheet');
    if (sheet) sheet.scrollTop = 0;
  }

  function closeMobileWordSheet() {
    activeWordId = '';
    closeModal();
  }

  document.addEventListener('click', (event) => {
    const backdrop = document.getElementById('modal-backdrop');
    if (event.target === backdrop) activeWordId = '';

    const target = event.target.closest?.('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'word-select' && isMobileLayout()) {
      event.preventDefault();
      openMobileWordSheet(target.dataset.wordId);
      return;
    }

    if (action === 'mobile-word-close') {
      event.preventDefault();
      closeMobileWordSheet();
      return;
    }

    if (
      activeWordId &&
      target.closest('.mobile-word-sheet') &&
      action === 'word-toggle'
    ) {
      openMobileWordSheet(activeWordId);
      return;
    }

    if (
      ['shadow-open', 'translation-knowledge', 'modal-cancel'].includes(action)
    ) {
      activeWordId = '';
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') activeWordId = '';
  });

  function syncVisibleViewport() {
    const height = window.visualViewport?.height || window.innerHeight;
    if (!height) return;
    document.documentElement.style.setProperty(
      '--sakura-visible-height',
      `${Math.round(height)}px`,
    );
  }

  syncVisibleViewport();
  window.addEventListener('resize', syncVisibleViewport);
  window.visualViewport?.addEventListener('resize', syncVisibleViewport);
  window.visualViewport?.addEventListener('scroll', syncVisibleViewport);

  document.addEventListener('focusin', (event) => {
    if (!isMobileLayout() || !event.target.closest?.('.modal')) return;
    setTimeout(() => {
      event.target.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }, 180);
  });
})();
