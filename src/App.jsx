import React, { useState, useEffect } from 'react';
import { toKana } from 'wanakana';
import kanjiData from '../kanji_game_data.json';
import './App.css';

function App() {
  // Güvenlik: Sayfa yenilendiğinde varsayılan olarak ana ekrana dön
  const [screen, setScreen] = useState('home');
  const [selectedMode, setSelectedMode] = useState(() => {
    try {
      const saved = localStorage.getItem('kanji_selected_mode');
      return saved ? JSON.parse(saved) : 'mixed';
    } catch (e) {
      return 'mixed';
    }
  });
  const [currentQuiz, setCurrentQuiz] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [quizMode, setQuizMode] = useState('reading');
  const [selectedKanji, setSelectedKanji] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(['A']); // Varsayılan olarak A grubu açık
  const [lastSectionIndex, setLastSectionIndex] = useState(() => {
    try {
      const saved = localStorage.getItem('kanji_last_section');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [progress, setProgress] = useState(() => {
    try {
      const saved = localStorage.getItem('kanji_progress');
      console.log('Yüklenen progress:', saved);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error('Progress yükleme hatası:', e);
      return {};
    }
  });

  // Validate helper function
  const isValidOption = (val) => {
    if (val === null || val === undefined) return false;
    const s = String(val).trim();
    const lower = s.toLowerCase();
    return s.length > 0 && 
           s !== '-' && 
           s !== '?' &&
           !lower.includes('bilinmiyor') &&
           !lower.includes('unknown');
  };

  // Collect all valid readings
  const collectReadings = () => {
    const readings = new Set();
    kanjiData.forEach((entry) => {
      if (entry.vocabulary) {
        entry.vocabulary.forEach((v) => {
          if (isValidOption(v.reading)) readings.add(v.reading);
        });
      }
    });
    return [...readings];
  };

  // Collect all valid meanings
  const collectMeanings = () => {
    const meanings = new Set();
    kanjiData.forEach((entry) => {
      if (entry.vocabulary) {
        entry.vocabulary.forEach((v) => {
          const val = v.turkish || v.english;
          if (isValidOption(val)) meanings.add(val);
        });
      }
    });
    return [...meanings];
  };

  // Build options
  const buildOptions = (correct, mode) => {
    const pool = mode === 'reading' ? collectReadings() : collectMeanings();
    
    // Filter valid options, exclude correct
    const validPool = pool.filter((item) => isValidOption(item) && item !== correct);
    
    // Pick random distractors
    const picked = [...validPool].sort(() => Math.random() - 0.5).slice(0, 3);
    
    return [correct, ...picked].sort(() => Math.random() - 0.5);
  };

  // LocalStorage'ı tamamen temizleme fonksiyonu
  const clearAllData = () => {
    if (window.confirm('Tüm ilerlemenizi silmek istediğinizden emin misiniz?')) {
      localStorage.clear();
      setProgress({});
      setLastSectionIndex(null);
      setSelectedMode('mixed');
      window.location.reload();
    }
  };

  useEffect(() => {
    try {
      console.log('Kaydedilen progress:', progress);
      localStorage.setItem('kanji_progress', JSON.stringify(progress));
    } catch (e) {
      console.error('Progress kaydetme hatası:', e);
    }
  }, [progress]);

  useEffect(() => {
    localStorage.setItem('kanji_selected_mode', JSON.stringify(selectedMode));
  }, [selectedMode]);

  const createSections = () => {
    const sections = [];
    let kanjiCount = 0;
    let normalSectionCount = 0;

    kanjiData.forEach((kanji, index) => {
      kanjiCount++;
      normalSectionCount++;
      
      sections.push({
        type: 'kanji',
        id: `kanji-${index}`,
        title: `Bölüm ${normalSectionCount}`,
        kanji: kanji,
        words: kanji.vocabulary ? kanji.vocabulary.map(v => ({ ...v, kanji: kanji.kanji })) : []
      });

      if (kanjiCount % 10 === 0 && kanjiCount > 0) {
        const startIndex = Math.max(0, kanjiCount - 10);
        const bossKanji = kanjiData.slice(startIndex, kanjiCount);
        const bossWords = [];
        bossKanji.forEach(k => {
          if (k.vocabulary) {
            k.vocabulary.forEach(v => bossWords.push({ ...v, kanji: k.kanji }));
          }
        });
        
        sections.push({
          type: 'mini-boss',
          id: `mini-boss-${kanjiCount / 10}`,
          title: `🔥 Mini Boss: Son 10 Kanji`,
          subtitle: `Kanji ${kanjiCount - 9} - ${kanjiCount}`,
          kanjiList: bossKanji,
          words: bossWords
        });
      }

      if (kanjiCount % 50 === 0 && kanjiCount > 0) {
        const startIndex = Math.max(0, kanjiCount - 50);
        const bossKanji = kanjiData.slice(startIndex, kanjiCount);
        const bossWords = [];
        bossKanji.forEach(k => {
          if (k.vocabulary) {
            k.vocabulary.forEach(v => bossWords.push({ ...v, kanji: k.kanji }));
          }
        });
        
        sections.push({
          type: 'big-boss',
          id: `big-boss-${kanjiCount / 50}`,
          title: `👹 Büyük Boss: Son 50 Kanji`,
          subtitle: `Kanji ${kanjiCount - 49} - ${kanjiCount}`,
          kanjiList: bossKanji,
          words: bossWords
        });
      }
    });

    return sections;
  };

  const sections = createSections();

  // Bölümleri 50'lik gruplara ayır
  const groupSections = () => {
    const groups = [];
    let currentGroup = [];
    let currentGroupLetter = 'A';
    let groupStartKanji = 1;

    sections.forEach((section, index) => {
      if (section.type === 'big-boss') {
        // Büyük boss'tan sonra yeni grup başlat
        currentGroup.push(section);
        groups.push({
          letter: currentGroupLetter,
          startKanji: groupStartKanji,
          endKanji: groupStartKanji + 49,
          sections: [...currentGroup]
        });
        currentGroup = [];
        currentGroupLetter = String.fromCharCode(currentGroupLetter.charCodeAt(0) + 1);
        groupStartKanji += 50;
      } else {
        currentGroup.push(section);
      }
    });

    // Son kalan bölümleri ekle
    if (currentGroup.length > 0) {
      groups.push({
        letter: currentGroupLetter,
        startKanji: groupStartKanji,
        endKanji: Math.min(groupStartKanji + 49, kanjiData.length),
        sections: currentGroup
      });
    }

    return groups;
  };

  const groups = groupSections();

  const toggleGroup = (letter) => {
    setExpandedGroups(prev => {
      if (prev.includes(letter)) {
        return prev.filter(l => l !== letter);
      } else {
        return [...prev, letter];
      }
    });
  };

  const filteredSections = sections.filter(section => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    if (section.type === 'kanji') {
      const kanji = section.kanji;
      const hasKanji = kanji.kanji.includes(searchQuery);
      const hasWord = kanji.vocabulary?.some(v => 
        v.word.toLowerCase().includes(query) ||
        v.reading.toLowerCase().includes(query) ||
        v.english.toLowerCase().includes(query) ||
        (v.turkish && v.turkish.toLowerCase().includes(query))
      );
      return hasKanji || hasWord;
    } else {
      return section.kanjiList.some(kanji => 
        kanji.kanji.includes(searchQuery) ||
        kanji.vocabulary?.some(v => 
          v.word.toLowerCase().includes(query) ||
          v.reading.toLowerCase().includes(query) ||
          v.english.toLowerCase().includes(query) ||
          (v.turkish && v.turkish.toLowerCase().includes(query))
        )
      );
    }
  });

  const startQuiz = (section, sectionIndex) => {
    setLastSectionIndex(sectionIndex);
    localStorage.setItem('kanji_last_section', JSON.stringify(sectionIndex));
    
    const quizWords = [...section.words].sort(() => Math.random() - 0.5);
    setCurrentQuiz(quizWords);
    setQuizIndex(0);
    startQuestion(quizWords[0]);
    setScreen('quiz');
  };

  const continueLastQuiz = () => {
    if (lastSectionIndex !== null && sections[lastSectionIndex]) {
      startQuiz(sections[lastSectionIndex], lastSectionIndex);
    }
  };

  const startQuestion = (word) => {
    if (!word) return;
    
    let mode = selectedMode === 'mixed' 
      ? ['reading', 'meaning', 'turkish', 'writing'][Math.floor(Math.random() * 4)] 
      : selectedMode;

    // Check if we need to fallback due to missing data
    if (mode === 'reading' && !isValidOption(word.reading)) {
      mode = isValidOption(word.english) ? 'meaning' : isValidOption(word.turkish) ? 'turkish' : 'reading';
    } else if (mode === 'meaning' && !isValidOption(word.english)) {
      mode = isValidOption(word.turkish) ? 'turkish' : isValidOption(word.reading) ? 'reading' : 'meaning';
    } else if (mode === 'turkish' && !isValidOption(word.turkish)) {
      mode = isValidOption(word.english) ? 'meaning' : isValidOption(word.reading) ? 'reading' : 'turkish';
    } else if (mode === 'writing' && !isValidOption(word.reading)) {
      mode = isValidOption(word.english) ? 'meaning' : isValidOption(word.turkish) ? 'turkish' : 'meaning';
    }

    setCurrentWord(word);
    setQuizMode(mode);
    setInputValue('');
    setFeedback(null);

    if (mode !== 'writing') {
      let correctAnswer;
      if (mode === 'reading') correctAnswer = word.reading;
      else if (mode === 'meaning') correctAnswer = word.english;
      else if (mode === 'turkish') correctAnswer = word.turkish;
      
      // Final fallback for correct answer
      if (!isValidOption(correctAnswer)) {
        correctAnswer = word.english || word.turkish || word.reading || word.word;
      }
      
      const options = buildOptions(correctAnswer, mode);
      setOptions(options);
    }
  };

  const handleAnswer = (answer) => {
    if (!currentWord || feedback) return;

    let isCorrect = false;
    
    if (quizMode === 'reading') {
      isCorrect = answer === currentWord.reading;
    } else if (quizMode === 'meaning') {
      isCorrect = answer === currentWord.english;
    } else if (quizMode === 'turkish') {
      isCorrect = answer === currentWord.turkish;
    } else if (quizMode === 'writing') {
      const hiraganaInput = toKana(inputValue.toLowerCase());
      isCorrect = hiraganaInput === currentWord.reading;
    }

    setFeedback(isCorrect ? 'correct' : 'incorrect');

    const wordKey = `${currentWord.kanji}-${currentWord.word}`;
    setProgress(prev => ({
      ...prev,
      [wordKey]: {
        ...prev[wordKey],
        attempts: (prev[wordKey]?.attempts || 0) + 1,
        correct: (prev[wordKey]?.correct || 0) + (isCorrect ? 1 : 0)
      }
    }));

    setTimeout(() => {
      if (quizIndex < currentQuiz.length - 1) {
        const nextIndex = quizIndex + 1;
        setQuizIndex(nextIndex);
        startQuestion(currentQuiz[nextIndex]);
      } else {
        setScreen('home');
      }
    }, 1500);
  };

  const goToKanjiDetail = (kanji) => {
    setSelectedKanji(kanji);
    setScreen('kanjiDetail');
  };

  const getSectionProgress = (section) => {
    let totalWords = 0;
    let completedWords = 0;
    
    section.words.forEach(word => {
      const key = `${word.kanji}-${word.word}`;
      if (progress[key]) {
        totalWords++;
        if (progress[key].correct > 0) {
          completedWords++;
        }
      } else {
        totalWords++;
      }
    });
    
    const percentage = totalWords > 0 ? Math.round((completedWords / totalWords) * 100) : 0;
    return { completed: completedWords, total: totalWords, percentage };
  };

  const getKanjiProgress = (kanji) => {
    if (!kanji.vocabulary) return { total: 0, correct: 0 };
    let total = 0;
    let correct = 0;
    kanji.vocabulary.forEach(v => {
      const key = `${kanji.kanji}-${v.word}`;
      if (progress[key]) {
        total += progress[key].attempts;
        correct += progress[key].correct;
      }
    });
    return { total, correct };
  };

  const getTotalStats = () => {
    let totalWords = 0;
    let completedWords = 0;
    sections.forEach(section => {
      section.words.forEach(word => {
        totalWords++;
        const key = `${word.kanji}-${word.word}`;
        if (progress[key]?.correct > 0) {
          completedWords++;
        }
      });
    });
    return { completed: completedWords, total: totalWords };
  };

  // Get all words with 2+ mistakes
  const getReviewWords = () => {
    const reviewWords = [];
    sections.forEach(section => {
      section.words.forEach(word => {
        const key = `${word.kanji}-${word.word}`;
        const wordProgress = progress[key];
        if (wordProgress) {
          const mistakes = wordProgress.attempts - wordProgress.correct;
          if (mistakes >= 2) {
            reviewWords.push(word);
          }
        }
      });
    });
    return reviewWords;
  };

  // Start review mode
  const startReviewMode = () => {
    const reviewWords = getReviewWords();
    if (reviewWords.length === 0) {
      alert('Henüz 2 veya daha fazla hata yaptığınız kelime yok! 🎉');
      return;
    }
    
    const quizWords = [...reviewWords].sort(() => Math.random() - 0.5);
    setCurrentQuiz(quizWords);
    setQuizIndex(0);
    startQuestion(quizWords[0]);
    setScreen('quiz');
  };

  const totalStats = getTotalStats();

  return (
    <div className="app">
      {screen === 'home' && (
        <div className="home-screen">
          <header className="header">
            <h1 className="title">漢字クイズ</h1>
            <p className="subtitle">Vault Quiz</p>
            <div className="header-info">
              <span>{kanjiData.length} kanji • {groups.length} grup</span>
            </div>
          </header>

          <div className="divider"></div>

          <div className="kanji-display-main">
            <div className="big-kanji">漢</div>
            <h2 className="quiz-title">Kanji Quiz</h2>
            <p className="quiz-subtitle">Vault notlarından üretildi</p>
          </div>

          {lastSectionIndex !== null && sections[lastSectionIndex] && (
            <div className="continue-section">
              <button className="continue-btn" onClick={continueLastQuiz}>
                📚 Devam Et: {sections[lastSectionIndex].title}
              </button>
            </div>
          )}

          <div className="search-section">
            <input
              type="text"
              className="search-input"
              placeholder="🔍 Kanji, kelime, okunuş, anlam ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="section">
            <h3 className="section-title">SORU MODU</h3>
            <div className="mode-buttons">
              <button 
                className={`mode-btn ${selectedMode === 'mixed' ? 'active' : ''}`}
                onClick={() => setSelectedMode('mixed')}
              >
                Karışık
              </button>
              <button 
                className={`mode-btn ${selectedMode === 'meaning' ? 'active' : ''}`}
                onClick={() => setSelectedMode('meaning')}
              >
                İngilizce Anlam
              </button>
              <button 
                className={`mode-btn ${selectedMode === 'turkish' ? 'active' : ''}`}
                onClick={() => setSelectedMode('turkish')}
              >
                Türkçe Anlam
              </button>
              <button 
                className={`mode-btn ${selectedMode === 'reading' ? 'active' : ''}`}
                onClick={() => setSelectedMode('reading')}
              >
                Okunuş
              </button>
              <button 
                className={`mode-btn ${selectedMode === 'writing' ? 'active' : ''}`}
                onClick={() => setSelectedMode('writing')}
              >
                Yazma
              </button>
            </div>
          </div>

          {/* Review Mode Button */}
          <div className="section">
            <button 
              className="review-mode-btn"
              onClick={() => startReviewMode()}
            >
              🎯 Hata Yaptığım Kelimeleri Tekrarla
              <span className="review-count">
                ({getReviewWords().length} kelime)
              </span>
            </button>
          </div>

          <div className="section">
            <div className="section-header">
              <h3 className="section-title">BÖLÜMLER</h3>
              <div className="header-actions">
                <div className="progress-summary">
                  {totalStats.completed}/{totalStats.total} kelime tamamlandı
                </div>
                <button className="clear-btn" onClick={clearAllData}>
                  🗑️ Sıfırla
                </button>
              </div>
            </div>
            
            {searchQuery ? (
              // Arama varsa tüm sonuçları göster
              <div className="blocks-grid">
                {filteredSections.map((section, sectionIndex) => {
                  const originalIndex = sections.indexOf(section);
                  const sectionProgress = getSectionProgress(section);
                  return (
                    <div 
                      key={sectionIndex} 
                      className={`block-card ${section.type}`}
                      onClick={() => startQuiz(section, originalIndex)}
                    >
                      <div className="block-header">
                        <h4 className="block-title">{section.title}</h4>
                        <span className="block-status">
                          {section.type === 'mini-boss' && '🔥 Mini Boss'}
                          {section.type === 'big-boss' && '👹 Büyük Boss'}
                          {section.type === 'kanji' && section.kanji.kanji}
                        </span>
                      </div>
                      {section.subtitle && (
                        <div className="block-subtitle">{section.subtitle}</div>
                      )}
                      
                      {section.type === 'kanji' ? (
                        <>
                          <div className="block-kanji single">
                            <span 
                              className="mini-kanji large"
                              onClick={(e) => {
                                e.stopPropagation();
                                goToKanjiDetail(section.kanji);
                              }}
                            >
                              {section.kanji.kanji}
                            </span>
                          </div>
                          <div className="vocab-preview">
                            {section.words.slice(0, 2).map((w, i) => (
                              <div key={i} className="vocab-preview-item">
                                {w.word}
                              </div>
                            ))}
                            {section.words.length > 2 && (
                              <div className="vocab-preview-more">+{section.words.length - 2} daha</div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="boss-kanji-list">
                          {section.kanjiList.map((k, i) => (
                            <span 
                              key={i} 
                              className="mini-kanji"
                              onClick={(e) => {
                                e.stopPropagation();
                                goToKanjiDetail(k);
                              }}
                            >
                              {k.kanji}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <div className="block-progress">
                        {sectionProgress.completed}/{sectionProgress.total} kelime • %{sectionProgress.percentage}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Arama yoksa gruplandırılmış görünüm
              <div className="groups-container">
                {groups.map((group, groupIndex) => {
                  const isExpanded = expandedGroups.includes(group.letter);
                  return (
                    <div key={groupIndex} className="group-card">
                      <button 
                        className="group-header"
                        onClick={() => toggleGroup(group.letter)}
                      >
                        <span className="group-title">
                          Kanji {group.startKanji} - {group.endKanji}
                        </span>
                        <span className={`group-arrow ${isExpanded ? 'expanded' : ''}`}>
                          ▼
                        </span>
                      </button>
                      
                      {isExpanded && (
                        <div className="group-content">
                          <div className="blocks-grid">
                            {group.sections.map((section, sectionIndex) => {
                              const originalIndex = sections.indexOf(section);
                              const sectionProgress = getSectionProgress(section);
                              return (
                                <div 
                                  key={sectionIndex} 
                                  className={`block-card ${section.type}`}
                                  onClick={() => startQuiz(section, originalIndex)}
                                >
                                  <div className="block-header">
                                    <h4 className="block-title">{section.title}</h4>
                                    <span className="block-status">
                                      {section.type === 'mini-boss' && '🔥 Mini Boss'}
                                      {section.type === 'big-boss' && '👹 Büyük Boss'}
                                      {section.type === 'kanji' && section.kanji.kanji}
                                    </span>
                                  </div>
                                  {section.subtitle && (
                                    <div className="block-subtitle">{section.subtitle}</div>
                                  )}
                                  
                                  {section.type === 'kanji' ? (
                                    <>
                                      <div className="block-kanji single">
                                        <span 
                                          className="mini-kanji large"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            goToKanjiDetail(section.kanji);
                                          }}
                                        >
                                          {section.kanji.kanji}
                                        </span>
                                      </div>
                                      <div className="vocab-preview">
                                        {section.words.slice(0, 2).map((w, i) => (
                                          <div key={i} className="vocab-preview-item">
                                            {w.word}
                                          </div>
                                        ))}
                                        {section.words.length > 2 && (
                                          <div className="vocab-preview-more">+{section.words.length - 2} daha</div>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="boss-kanji-list">
                                      {section.kanjiList.map((k, i) => (
                                        <span 
                                          key={i} 
                                          className="mini-kanji"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            goToKanjiDetail(k);
                                          }}
                                        >
                                          {k.kanji}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  
                                  <div className="block-progress">
                                    {sectionProgress.completed}/{sectionProgress.total} kelime • %{sectionProgress.percentage}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'quiz' && currentWord && (
        <div className="quiz-screen">
          <button className="back-btn" onClick={() => setScreen('home')}>
            ← Geri
          </button>
          
          <div className="quiz-progress">
            {quizIndex + 1}/{currentQuiz.length}
          </div>

          <div className="question-card">
            <div className="kanji-display">{currentWord.kanji}</div>
            <div className="word-display">{currentWord.word}</div>
            
            {quizMode === 'reading' && (
              <div className="mode-section">
                <h3>Okunuşunu seçin:</h3>
                <div className="options-grid">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-btn ${feedback ? (opt === currentWord.reading ? 'correct' : 'incorrect') : ''}`}
                      onClick={() => handleAnswer(opt)}
                      disabled={feedback}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {quizMode === 'meaning' && (
              <div className="mode-section">
                <h3>İngilizce anlamını seçin:</h3>
                <div className="options-grid">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-btn ${feedback ? (opt === currentWord.english ? 'correct' : 'incorrect') : ''}`}
                      onClick={() => handleAnswer(opt)}
                      disabled={feedback}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {quizMode === 'turkish' && (
              <div className="mode-section">
                <h3>Türkçe anlamını seçin:</h3>
                <div className="options-grid">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-btn ${feedback ? (opt === currentWord.turkish ? 'correct' : 'incorrect') : ''}`}
                      onClick={() => handleAnswer(opt)}
                      disabled={feedback}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {quizMode === 'writing' && (
              <div className="mode-section">
                <h3>Okunuşunu yazın (romaji):</h3>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !feedback && handleAnswer()}
                  className="reading-input"
                  disabled={feedback}
                  placeholder="Örnek: genki"
                />
                <div className="kana-preview">{toKana(inputValue.toLowerCase())}</div>
                {!feedback && (
                  <button className="submit-btn" onClick={() => handleAnswer()}>
                    Gönder
                  </button>
                )}
                {feedback && (
                  <div className={`feedback ${feedback}`}>
                    {feedback === 'correct' ? '✓ Doğru!' : `✗ Yanlış! Cevap: ${currentWord.reading}`}
                  </div>
                )}
              </div>
            )}

            {quizMode !== 'writing' && feedback && (
              <div className={`feedback ${feedback}`}>
                {feedback === 'correct' ? '✓ Doğru!' : '✗ Yanlış!'}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'kanjiDetail' && selectedKanji && (
        <div className="detail-screen">
          <button className="back-btn" onClick={() => setScreen('home')}>
            ← Geri
          </button>

          <div className="detail-card">
            <div className="detail-kanji">{selectedKanji.kanji}</div>
            <div className="detail-info">
              <p><strong>Level:</strong> {selectedKanji.level}</p>
              <p><strong>Frekans:</strong> {selectedKanji.frequency}</p>
            </div>

            {selectedKanji.vocabulary && (
              <div className="vocab-list">
                <h3>Kelimeler:</h3>
                {selectedKanji.vocabulary.map((v, i) => {
                  const key = `${selectedKanji.kanji}-${v.word}`;
                  const wordProgress = progress[key];
                  return (
                    <div key={i} className="vocab-item">
                      <div className="vocab-word">{v.word}</div>
                      <div className="vocab-reading">{v.reading}</div>
                      <div className="vocab-meaning">{v.english} • {v.turkish}</div>
                      {wordProgress && (
                        <div className="vocab-progress">
                          {wordProgress.correct}/{wordProgress.attempts} doğru
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button 
              className="practice-btn"
              onClick={() => {
                const words = selectedKanji.vocabulary 
                  ? selectedKanji.vocabulary.map(v => ({ ...v, kanji: selectedKanji.kanji }))
                  : [];
                setCurrentQuiz(words);
                setQuizIndex(0);
                startQuestion(words[0]);
                setScreen('quiz');
              }}
            >
              Bu kanjiyle pratik yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
