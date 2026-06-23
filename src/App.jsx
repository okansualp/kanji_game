import React, { useState, useEffect } from 'react';
import { toKana } from 'wanakana';
import kanjiData from '../kanji_game_data.json';
import './App.css';

function App() {
  const [screen, setScreen] = useState('home');
  const [selectedMode, setSelectedMode] = useState('mixed');
  const [currentQuiz, setCurrentQuiz] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [quizMode, setQuizMode] = useState('reading');
  const [selectedKanji, setSelectedKanji] = useState(null);
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

  useEffect(() => {
    try {
      console.log('Kaydedilen progress:', progress);
      localStorage.setItem('kanji_progress', JSON.stringify(progress));
    } catch (e) {
      console.error('Progress kaydetme hatası:', e);
    }
  }, [progress]);
  const createSections = () => {
    const sections = [];
    let kanjiCount = 0;

    kanjiData.forEach((kanji, index) => {
      kanjiCount++;
      
      // Her kanji için ayrı bölüm
      sections.push({
        type: 'kanji',
        id: `kanji-${index}`,
        title: `Bölüm ${sections.length + 1}`,
        kanji: kanji,
        words: kanji.vocabulary ? kanji.vocabulary.map(v => ({ ...v, kanji: kanji.kanji })) : []
      });

      // Her 10 kanji sonrası mini boss
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
          title: `🔥 Mini Boss ${kanjiCount / 10}`,
          kanjiList: bossKanji,
          words: bossWords
        });
      }

      // Her 50 kanji sonrası büyük boss
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
          title: `👹 Büyük Boss ${kanjiCount / 50}`,
          kanjiList: bossKanji,
          words: bossWords
        });
      }
    });

    return sections;
  };

  const sections = createSections();

  useEffect(() => {
    localStorage.setItem('kanji_progress', JSON.stringify(progress));
  }, [progress]);

  const generateOptions = (word, mode) => {
    const correctAnswer = mode === 'reading' ? word.reading : word.english;
    const allWords = [];
    kanjiData.forEach(k => {
      if (k.vocabulary) {
        k.vocabulary.forEach(v => allWords.push(v));
      }
    });
    
    const wrongAnswers = allWords
      .filter(w => w !== word && (mode === 'reading' ? w.reading !== correctAnswer : w.english !== correctAnswer))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    
    const opts = [...wrongAnswers.map(w => mode === 'reading' ? w.reading : w.english), correctAnswer]
      .sort(() => Math.random() - 0.5);
    
    setOptions(opts);
  };

  const startQuiz = (section) => {
    const quizWords = [...section.words].sort(() => Math.random() - 0.5);
    setCurrentQuiz(quizWords);
    setQuizIndex(0);
    startQuestion(quizWords[0]);
    setScreen('quiz');
  };

  const startQuestion = (word) => {
    if (word) {
      setCurrentWord(word);
      
      let mode;
      if (selectedMode === 'meaning') {
        mode = 'meaning';
      } else if (selectedMode === 'reading') {
        mode = 'reading';
      } else {
        mode = Math.random() > 0.5 ? 'reading' : 'meaning';
      }
      
      setQuizMode(mode);
      setInputValue('');
      setFeedback(null);
      
      generateOptions(word, mode);
    }
  };

  const handleAnswer = (answer) => {
    if (!currentWord || feedback) return;

    let isCorrect = false;
    
    if (quizMode === 'reading') {
      isCorrect = answer === currentWord.reading;
    } else if (quizMode === 'meaning') {
      isCorrect = answer === currentWord.english;
    } else {
      const hiraganaInput = toKana(inputValue.toLowerCase());
      isCorrect = hiraganaInput === currentWord.reading;
    }

    setFeedback(isCorrect ? 'correct' : 'incorrect');

    // Update progress
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
    
    if (section.type === 'kanji') {
      totalWords = section.words.length;
      section.words.forEach(word => {
        const key = `${word.kanji}-${word.word}`;
        if (progress[key]?.attempts > 0) {
          completedWords++;
        }
      });
    } else {
      totalWords = section.words.length;
      section.words.forEach(word => {
        const key = `${word.kanji}-${word.word}`;
        if (progress[key]?.attempts > 0) {
          completedWords++;
        }
      });
    }
    
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
        if (progress[key]?.attempts > 0) {
          completedWords++;
        }
      });
    });
    return { completed: completedWords, total: totalWords };
  };

  const totalStats = getTotalStats();

  return (
    <div className="app">
      {/* Ana Ekran */}
      {screen === 'home' && (
        <div className="home-screen">
          <header className="header">
            <h1 className="title">漢字クイズ</h1>
            <p className="subtitle">Vault Quiz</p>
            <div className="header-info">
              <span>{sections.length} bölüm • {kanjiData.length} kanji</span>
            </div>
          </header>

          <div className="divider"></div>

          <div className="kanji-display-main">
            <div className="big-kanji">漢</div>
            <h2 className="quiz-title">Kanji Quiz</h2>
            <p className="quiz-subtitle">Vault notlarından üretildi</p>
          </div>

          {/* Soru Modu */}
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
                Anlam
              </button>
              <button 
                className={`mode-btn ${selectedMode === 'reading' ? 'active' : ''}`}
                onClick={() => setSelectedMode('reading')}
              >
                Okunuş
              </button>
            </div>
          </div>

          {/* Bölümler */}
          <div className="section">
            <div className="section-header">
              <h3 className="section-title">BÖLÜMLER</h3>
              <div className="progress-summary">
                {totalStats.completed}/{totalStats.total} kelime tamamlandı
              </div>
            </div>
            
            <div className="blocks-grid">
              {sections.map((section, sectionIndex) => {
                const sectionProgress = getSectionProgress(section);
                return (
                  <div 
                    key={sectionIndex} 
                    className={`block-card ${section.type}`}
                    onClick={() => startQuiz(section)}
                  >
                    <div className="block-header">
                      <h4 className="block-title">{section.title}</h4>
                      <span className="block-status">
                        {section.type === 'mini-boss' && '🔥 Mini Boss'}
                        {section.type === 'big-boss' && '👹 Büyük Boss'}
                        {section.type === 'kanji' && section.kanji.kanji}
                      </span>
                    </div>
                    
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
        </div>
      )}

      {/* Quiz Ekranı */}
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
                <h3>Anlamını seçin:</h3>
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

            {feedback && (
              <div className={`feedback ${feedback}`}>
                {feedback === 'correct' ? '✓ Doğru!' : `✗ Yanlış!`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Kanji Detay Ekranı */}
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
                {selectedKanji.vocabulary.map((v, i) => (
                  <div key={i} className="vocab-item">
                    <div className="vocab-word">{v.word}</div>
                    <div className="vocab-reading">{v.reading}</div>
                    <div className="vocab-meaning">{v.english} • {v.turkish}</div>
                  </div>
                ))}
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
