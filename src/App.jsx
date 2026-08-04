import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { toKana } from 'wanakana';
import kanjiData from '../kanji_game_data.json';
import './App.css';

const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const LEVEL_SORT = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
const FREQUENCY_RANGES = [
  { id: '1-2000', label: '1-2000', file: '1_-_2000.csv' },
  { id: '2001-4000', label: '2001-4000', file: '2001_-_4000.csv' },
  { id: '4001-6000', label: '4001-6000', file: '4001_-_6000.csv' },
  { id: '6001-8000', label: '6001-8000', file: '6001_-_8000.csv' },
  { id: '8001-10000', label: '8001-10000', file: '8001_-_10000.csv' }
];

const defaultSaveState = {
  selectedCategory: 'vocab',
  selectedModes: ['mixed'],
  selectedLevel: 'all',
  lastSectionIndex: null,
  lastGrammarSectionId: null,
  progress: {},
  kanjiIndex: 0,
  bossLevel: 1,
  completedKanjis: [],
  completedWords: [],
  customGroups: [],
  timerEnabled: true
};

const buildGrammarUrl = (level) => `${import.meta.env.BASE_URL}data/jlpt-grammar/${level}.json`;
const buildFrequencyUrl = (fileName) => `${import.meta.env.BASE_URL}data/frequency/${fileName}`;
const getFrequencyRangeStart = (rangeId) => Number(String(rangeId).split('-')[0] || 1);

const getQuizItemKey = (item) => {
  if (!item) return '';
  if (item.type === 'grammar') {
    return `grammar-${item.level}-${item.id}`;
  }
  return `${item.kanji}-${item.word}`;
};

const normalizeGrammarQuestion = (item) => {
  const correctAnswer = item.options?.[item.correctIndex] ?? item.answerWord ?? '';

  return {
    ...item,
    type: 'grammar',
    correctAnswer,
    options: Array.isArray(item.options) ? item.options : []
  };
};

const parseFrequencyCsv = (csvText, rangeId) => {
  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true
  });

  const rows = parsed.data || [];
  const rangeStart = getFrequencyRangeStart(rangeId);
  const firstRow = rows[0] || [];
  const hasHeader = Array.isArray(firstRow) && String(firstRow[0] || '').toLowerCase() === 'rank';
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((row, index) => {
      if (!Array.isArray(row)) return null;

      if (row.length >= 4) {
        const rank = Number(row[0]);
        const reading = String(row[2] || '').trim();
        const word = String(row[1] || '').trim() || reading;
        const meaning = String(row[3] || '').trim();

        if (!rank || !word || !reading || !meaning) return null;

        return {
          id: `frequency-${rank}`,
          rank,
          word,
          reading,
          meaning
        };
      }

      if (row.length >= 3) {
        const reading = String(row[1] || '').trim();
        const word = String(row[0] || '').trim() || reading;
        const meaning = String(row[2] || '').trim();
        const rank = rangeStart + index;

        if (!word || !reading || !meaning) return null;

        return {
          id: `frequency-${rank}`,
          rank,
          word,
          reading,
          meaning
        };
      }

      return null;
    })
    .filter(Boolean);
};

function App() {
  const [screen, setScreen] = useState('home');
  const [currentQuiz, setCurrentQuiz] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [quizMode, setQuizMode] = useState('reading');
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [selectedKanji, setSelectedKanji] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(['A']);
  const [timeLeft, setTimeLeft] = useState(3);
  const [timerActive, setTimerActive] = useState(false);
  const [grammarDataByLevel, setGrammarDataByLevel] = useState({});
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarLoadError, setGrammarLoadError] = useState('');
  const [frequencyDataByRange, setFrequencyDataByRange] = useState({});
  const [frequencyLoading, setFrequencyLoading] = useState(false);
  const [frequencyLoadError, setFrequencyLoadError] = useState('');
  const [selectedFrequencyRange, setSelectedFrequencyRange] = useState(FREQUENCY_RANGES[0].id);
  const [frequencyOrder, setFrequencyOrder] = useState('random');
  const [frequencyDeck, setFrequencyDeck] = useState([]);
  const [frequencyIndex, setFrequencyIndex] = useState(0);
  const [isFrequencyFlipped, setIsFrequencyFlipped] = useState(false);
  const [frequencyKnown, setFrequencyKnown] = useState({});
  const [frequencySessionStarted, setFrequencySessionStarted] = useState(false);

  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedKanjisForGroup, setSelectedKanjisForGroup] = useState([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  const [saveState, setSaveState] = useState(() => {
    try {
      const saved = localStorage.getItem('kanji_save_state');
      if (!saved) return defaultSaveState;

      const parsed = JSON.parse(saved);
      if (parsed.selectedMode && !parsed.selectedModes) {
        return { ...defaultSaveState, ...parsed, selectedModes: [parsed.selectedMode] };
      }
      return { ...defaultSaveState, ...parsed };
    } catch (error) {
      console.error('SaveState yükleme hatası:', error);
      return defaultSaveState;
    }
  });

  const selectedCategory = saveState.selectedCategory;
  const selectedModes = saveState.selectedModes;
  const selectedLevel = saveState.selectedLevel;
  const lastSectionIndex = saveState.lastSectionIndex;
  const lastGrammarSectionId = saveState.lastGrammarSectionId;
  const progress = saveState.progress;
  const completedKanjis = new Set(saveState.completedKanjis);
  const completedWords = new Set(saveState.completedWords);
  const timerEnabled = saveState.timerEnabled;

  const isValidOption = (val) => {
    if (val === null || val === undefined) return false;
    const s = String(val).trim();
    const lower = s.toLowerCase();

    return (
      s.length > 0 &&
      s !== '-' &&
      s !== '?' &&
      !lower.includes('bilinmiyor') &&
      !lower.includes('unknown')
    );
  };

  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const returnHome = () => {
    setTimerActive(false);
    setScreen('home');
  };

  const filterVocabulary = (vocab) => {
    if (selectedLevel === 'all') return vocab;
    return vocab.filter((item) => item.word_level === selectedLevel);
  };

  const collectReadings = () => {
    const readings = new Set();
    kanjiData.forEach((entry) => {
      (entry.vocabulary || []).forEach((vocab) => {
        if (isValidOption(vocab.reading)) {
          readings.add(vocab.reading);
        }
      });
    });
    return [...readings];
  };

  const collectMeanings = () => {
    const meanings = new Set();
    kanjiData.forEach((entry) => {
      (entry.vocabulary || []).forEach((vocab) => {
        if (isValidOption(vocab.turkish)) {
          meanings.add(vocab.turkish);
        }
      });
    });
    return [...meanings];
  };

  const buildOptions = (correct, mode) => {
    const pool = mode === 'reading' ? collectReadings() : collectMeanings();
    const validPool = pool.filter((item) => isValidOption(item) && item !== correct);
    const picked = shuffleArray(validPool).slice(0, 3);
    return shuffleArray([correct, ...picked]);
  };

  useEffect(() => {
    try {
      localStorage.setItem('kanji_save_state', JSON.stringify(saveState));
    } catch (error) {
      console.error('SaveState kaydetme hatası:', error);
    }
  }, [saveState]);

  useEffect(() => {
    if (selectedCategory !== 'grammar') return undefined;

    const targetLevels = selectedLevel === 'all' ? JLPT_LEVELS : [selectedLevel];
    const missingLevels = targetLevels.filter((level) => !grammarDataByLevel[level]);

    if (missingLevels.length === 0) {
      setGrammarLoadError('');
      return undefined;
    }

    let cancelled = false;

    const loadGrammarLevels = async () => {
      setGrammarLoading(true);
      setGrammarLoadError('');

      const results = await Promise.allSettled(
        missingLevels.map(async (level) => {
          const response = await fetch(buildGrammarUrl(level));
          if (!response.ok) {
            throw new Error(`${level} verisi yüklenemedi`);
          }
          const payload = await response.json();
          return { level, payload: payload.map(normalizeGrammarQuestion) };
        })
      );

      if (cancelled) return;

      const loadedEntries = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);

      if (loadedEntries.length > 0) {
        setGrammarDataByLevel((prev) => {
          const next = { ...prev };
          loadedEntries.forEach(({ level, payload }) => {
            next[level] = payload;
          });
          return next;
        });
      }

      const failedLevels = results
        .filter((result) => result.status === 'rejected')
        .map((result, index) => (result.status === 'rejected' ? missingLevels[index] : null))
        .filter(Boolean);

      if (failedLevels.length > 0) {
        setGrammarLoadError(`${failedLevels.join(', ')} verisi yüklenemedi.`);
      }

      setGrammarLoading(false);
    };

    loadGrammarLevels();

    return () => {
      cancelled = true;
    };
  }, [selectedCategory, selectedLevel, grammarDataByLevel]);

    useEffect(() => {
      if (selectedCategory !== 'frequency') return undefined;
      if (frequencyDataByRange[selectedFrequencyRange]) {
        setFrequencyLoadError('');
        return undefined;
      }

      const range = FREQUENCY_RANGES.find((item) => item.id === selectedFrequencyRange);
      if (!range) return undefined;

      let cancelled = false;

      const loadFrequencyRange = async () => {
        setFrequencyLoading(true);
        setFrequencyLoadError('');

        try {
          const response = await fetch(buildFrequencyUrl(range.file));
          if (!response.ok) {
            throw new Error(`${range.label} verisi yüklenemedi`);
          }

          const csvText = await response.text();
          const parsedCards = parseFrequencyCsv(csvText, range.id);

          if (cancelled) return;

          setFrequencyDataByRange((prev) => ({
            ...prev,
            [range.id]: parsedCards
          }));
        } catch (error) {
          if (!cancelled) {
            setFrequencyLoadError(error instanceof Error ? error.message : 'Frekans verisi yüklenemedi.');
          }
        } finally {
          if (!cancelled) {
            setFrequencyLoading(false);
          }
        }
      };

      loadFrequencyRange();

      return () => {
        cancelled = true;
      };
    }, [selectedCategory, selectedFrequencyRange, frequencyDataByRange]);

  useEffect(() => {
    let interval;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            handleAnswer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const allFilteredWords = useMemo(() => {
    const allWords = [];
    kanjiData.forEach((kanji) => {
      filterVocabulary(kanji.vocabulary || []).forEach((vocab) => {
        allWords.push({ ...vocab, kanji: kanji.kanji });
      });
    });
    return allWords;
  }, [selectedLevel]);

  const grammarQuestions = useMemo(() => {
    if (selectedLevel === 'all') {
      return JLPT_LEVELS.flatMap((level) => grammarDataByLevel[level] || []);
    }
    return grammarDataByLevel[selectedLevel] || [];
  }, [grammarDataByLevel, selectedLevel]);

    const selectedFrequencyCards = useMemo(
      () => frequencyDataByRange[selectedFrequencyRange] || [],
      [frequencyDataByRange, selectedFrequencyRange]
    );

    const frequencyStats = useMemo(() => {
      const total = frequencyDeck.length;
      let known = 0;
      let unknown = 0;

      frequencyDeck.forEach((card) => {
        const status = frequencyKnown[card.id];
        if (status === 'known') known += 1;
        if (status === 'unknown') unknown += 1;
      });

      return { total, known, unknown };
    }, [frequencyDeck, frequencyKnown]);

    const currentFrequencyCard = frequencyDeck[frequencyIndex] || null;

  const createVocabSections = () => {
    const sections = [];
    let kanjiCount = 0;
    let normalSectionCount = 0;

    kanjiData.forEach((kanji, index) => {
      kanjiCount += 1;
      normalSectionCount += 1;

      const filteredVocab = filterVocabulary(kanji.vocabulary || []);

      if (filteredVocab.length > 0 || selectedLevel === 'all') {
        sections.push({
          type: 'kanji',
          category: 'vocab',
          id: `kanji-${index}`,
          title: `Bölüm ${normalSectionCount}`,
          kanji,
          words: filteredVocab.map((vocab) => ({ ...vocab, kanji: kanji.kanji }))
        });
      }

      if (kanjiCount % 10 === 0) {
        const startIndex = Math.max(0, kanjiCount - 10);
        const bossKanji = kanjiData.slice(startIndex, kanjiCount);
        const bossWords = [];

        bossKanji.forEach((item) => {
          filterVocabulary(item.vocabulary || []).forEach((vocab) => {
            bossWords.push({ ...vocab, kanji: item.kanji });
          });
        });

        if (bossWords.length > 0 || selectedLevel === 'all') {
          sections.push({
            type: 'mini-boss',
            category: 'vocab',
            id: `mini-boss-${kanjiCount / 10}`,
            title: '🔥 Mini Boss: Son 10 Kanji',
            subtitle: `Kanji ${kanjiCount - 9} - ${kanjiCount}`,
            kanjiList: bossKanji,
            words: bossWords
          });
        }
      }

      if (kanjiCount % 50 === 0) {
        const startIndex = Math.max(0, kanjiCount - 50);
        const bossKanji = kanjiData.slice(startIndex, kanjiCount);
        const bossWords = [];

        bossKanji.forEach((item) => {
          filterVocabulary(item.vocabulary || []).forEach((vocab) => {
            bossWords.push({ ...vocab, kanji: item.kanji });
          });
        });

        if (bossWords.length > 0 || selectedLevel === 'all') {
          sections.push({
            type: 'big-boss',
            category: 'vocab',
            id: `big-boss-${kanjiCount / 50}`,
            title: '👹 Büyük Boss: Son 50 Kanji',
            subtitle: `Kanji ${kanjiCount - 49} - ${kanjiCount}`,
            kanjiList: bossKanji,
            words: bossWords
          });
        }
      }
    });

    return sections;
  };

  const vocabSections = useMemo(() => createVocabSections(), [selectedLevel]);

  const grammarSections = useMemo(() => {
    const grouped = new Map();

    grammarQuestions.forEach((question) => {
      const key = `${question.level}-${question.practiceSet}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          type: 'grammar-set',
          category: 'grammar',
          id: `grammar-${question.level}-${question.practiceSet}`,
          title: selectedLevel === 'all' ? `${question.level} • ${question.practiceSet}` : question.practiceSet,
          subtitle: `${question.options.length > 0 ? question.options.length : 4} şıklı • ${question.level}`,
          level: question.level,
          practiceSet: question.practiceSet,
          words: []
        });
      }

      grouped.get(key).words.push(question);
    });

    return [...grouped.values()]
      .map((section) => ({
        ...section,
        subtitle: `${section.words.length} soru • ${section.level}`,
        previewQuestions: section.words.slice(0, 2)
      }))
      .sort((a, b) => {
        const levelDiff = LEVEL_SORT[a.level] - LEVEL_SORT[b.level];
        if (levelDiff !== 0) return levelDiff;
        return a.practiceSet.localeCompare(b.practiceSet, undefined, { numeric: true });
      });
  }, [grammarQuestions, selectedLevel]);

  const groupVocabSections = (sections) => {
    const groups = [];
    let currentGroup = [];
    let currentGroupLetter = 'A';
    let groupStartKanji = 1;

    sections.forEach((section) => {
      if (section.type === 'big-boss') {
        currentGroup.push(section);
        groups.push({
          id: currentGroupLetter,
          title: `Kanji ${groupStartKanji} - ${groupStartKanji + 49}`,
          sections: [...currentGroup]
        });
        currentGroup = [];
        currentGroupLetter = String.fromCharCode(currentGroupLetter.charCodeAt(0) + 1);
        groupStartKanji += 50;
      } else {
        currentGroup.push(section);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({
        id: currentGroupLetter,
        title: `Kanji ${groupStartKanji} - ${Math.min(groupStartKanji + 49, kanjiData.length)}`,
        sections: currentGroup
      });
    }

    return groups;
  };

  const vocabGroups = useMemo(() => groupVocabSections(vocabSections), [vocabSections]);

  const grammarGroups = useMemo(() => {
    if (selectedLevel === 'all') {
      return JLPT_LEVELS.map((level) => {
        const sections = grammarSections.filter((section) => section.level === level);
        return {
          id: `grammar-${level}`,
          title: `${level} Setleri`,
          sections
        };
      }).filter((group) => group.sections.length > 0);
    }

    const groups = [];
    for (let i = 0; i < grammarSections.length; i += 10) {
      const chunk = grammarSections.slice(i, i + 10);
      groups.push({
        id: `grammar-chunk-${Math.floor(i / 10) + 1}`,
        title: `${selectedLevel} • Set ${i + 1}-${i + chunk.length}`,
        sections: chunk
      });
    }
    return groups;
  }, [grammarSections, selectedLevel]);

  const activeSections = selectedCategory === 'grammar' ? grammarSections : vocabSections;
  const activeGroups = selectedCategory === 'grammar' ? grammarGroups : vocabGroups;
  const randomPool = selectedCategory === 'grammar' ? grammarQuestions : allFilteredWords;
  const reviewItemLabel = selectedCategory === 'grammar' ? 'soru' : 'kelime';

  const filteredSections = useMemo(() => {
    if (!searchQuery) return activeSections;
    const query = searchQuery.toLowerCase();

    if (selectedCategory === 'grammar') {
      return grammarSections.filter((section) => {
        if (section.title.toLowerCase().includes(query) || section.practiceSet.toLowerCase().includes(query)) {
          return true;
        }

        return section.words.some((question) => {
          const optionText = (question.options || []).join(' ').toLowerCase();
          return (
            question.question.toLowerCase().includes(query) ||
            question.questionWithAnswer.toLowerCase().includes(query) ||
            question.answerWord.toLowerCase().includes(query) ||
            optionText.includes(query)
          );
        });
      });
    }

    return vocabSections.filter((section) => {
      if (section.type === 'kanji') {
        return (
          section.kanji.kanji.includes(searchQuery) ||
          (section.kanji.vocabulary || []).some((vocab) =>
            vocab.word.toLowerCase().includes(query) ||
            String(vocab.reading || '').toLowerCase().includes(query) ||
            String(vocab.turkish || '').toLowerCase().includes(query)
          )
        );
      }

      return section.kanjiList.some((kanji) =>
        kanji.kanji.includes(searchQuery) ||
        (kanji.vocabulary || []).some((vocab) =>
          vocab.word.toLowerCase().includes(query) ||
          String(vocab.reading || '').toLowerCase().includes(query) ||
          String(vocab.turkish || '').toLowerCase().includes(query)
        )
      );
    });
  }, [activeSections, grammarSections, searchQuery, selectedCategory, vocabSections]);

  const getSectionProgress = (section) => {
    let total = 0;
    let completed = 0;

    section.words.forEach((item) => {
      total += 1;
      const key = getQuizItemKey(item);
      if (progress[key]?.correct > 0) {
        completed += 1;
      }
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  };

  const reviewWords = useMemo(() => {
    const items = [];
    activeSections.forEach((section) => {
      section.words.forEach((item) => {
        const key = getQuizItemKey(item);
        const itemProgress = progress[key];
        if (!itemProgress) return;

        const mistakes = itemProgress.attempts - itemProgress.correct;
        if (mistakes >= 2) {
          items.push(item);
        }
      });
    });
    return items;
  }, [activeSections, progress]);

  const totalStats = useMemo(() => {
    let total = 0;
    let completed = 0;

    activeSections.forEach((section) => {
      section.words.forEach((item) => {
        total += 1;
        const key = getQuizItemKey(item);
        if (progress[key]?.correct > 0) {
          completed += 1;
        }
      });
    });

    return { completed, total };
  }, [activeSections, progress]);

  const continueSection = useMemo(() => {
      if (selectedCategory === 'frequency') {
        return null;
      }
    if (selectedCategory === 'grammar') {
      return grammarSections.find((section) => section.id === lastGrammarSectionId) || null;
    }
    if (lastSectionIndex === null) return null;
    return vocabSections[lastSectionIndex] || null;
  }, [grammarSections, lastGrammarSectionId, lastSectionIndex, selectedCategory, vocabSections]);

  const goToKanjiDetail = (kanji) => {
    setSelectedKanji(kanji);
    setScreen('kanjiDetail');
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => (
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    ));
  };

  const handleKanjiComplete = () => {
    if (!selectedKanji || completedKanjis.has(selectedKanji.kanji)) return;
    setSaveState((prev) => ({
      ...prev,
      completedKanjis: [...(prev.completedKanjis || []), selectedKanji.kanji]
    }));
  };

  const handleWordComplete = (word) => {
    const wordKey = `${word.kanji}-${word.word}`;
    if (completedWords.has(wordKey)) return;

    setSaveState((prev) => ({
      ...prev,
      completedWords: [...(prev.completedWords || []), wordKey]
    }));
  };

  const toggleKanjiForGroup = (kanji) => {
    setSelectedKanjisForGroup((prev) => {
      const isSelected = prev.some((item) => item.kanji === kanji.kanji);
      return isSelected ? prev.filter((item) => item.kanji !== kanji.kanji) : [...prev, kanji];
    });
  };

  const createCustomGroup = () => {
    if (!newGroupName.trim()) {
      alert('Lütfen bir grup adı girin!');
      return;
    }

    if (selectedKanjisForGroup.length < 6 || selectedKanjisForGroup.length > 8) {
      alert('Lütfen 6-8 arası kanji seçin!');
      return;
    }

    const groupWords = [];
    selectedKanjisForGroup.forEach((kanji) => {
      (kanji.vocabulary || []).forEach((vocab) => {
        groupWords.push({ ...vocab, kanji: kanji.kanji });
      });
    });

    const newGroup = {
      id: Date.now(),
      name: newGroupName,
      kanjis: selectedKanjisForGroup,
      words: groupWords
    };

    setSaveState((prev) => ({
      ...prev,
      customGroups: [...(prev.customGroups || []), newGroup]
    }));

    setIsCreateGroupModalOpen(false);
    setNewGroupName('');
    setSelectedKanjisForGroup([]);
    setGroupSearchQuery('');
  };

  const deleteCustomGroup = (groupId, event) => {
    event.stopPropagation();
    if (!window.confirm('Bu grubu silmek istediğinize emin misiniz?')) return;

    setSaveState((prev) => ({
      ...prev,
      customGroups: (prev.customGroups || []).filter((group) => group.id !== groupId)
    }));
  };

  const startQuizSession = (items) => {
    if (!items.length) return;
    setCurrentQuiz(items);
    setQuizIndex(0);
    setScreen('quiz');
    startQuestion(items[0], 0);
  };

  const startCustomGroupQuiz = (group) => {
    const filteredWords = filterVocabulary(group.words || []);
    if (filteredWords.length === 0) {
      alert('Seçili seviyede bu grupta kelime yok!');
      return;
    }
    startQuizSession(shuffleArray(filteredWords));
  };

  const startQuiz = (section, sectionIndex = null) => {
    setSaveState((prev) => ({
      ...prev,
      lastSectionIndex: section.category === 'vocab' ? sectionIndex : prev.lastSectionIndex,
      lastGrammarSectionId: section.category === 'grammar' ? section.id : prev.lastGrammarSectionId
    }));

    startQuizSession(shuffleArray(section.words));
  };

  const startRandomQuiz = () => {
    if (randomPool.length === 0) {
      alert(
        selectedCategory === 'grammar'
          ? 'Seçili seviyede henüz yüklenmiş soru yok!'
          : 'Seçili seviyede hiç kelime yok!'
      );
      return;
    }

    startQuizSession(shuffleArray(randomPool).slice(0, 50));
  };

  const startReviewMode = () => {
    if (reviewWords.length === 0) {
      alert(`Henüz 2 veya daha fazla hata yaptığınız ${reviewItemLabel} yok! 🎉`);
      return;
    }

    startQuizSession(shuffleArray(reviewWords));
  };

  const reloadGrammarData = () => {
    setGrammarDataByLevel((prev) => {
      const next = { ...prev };
      if (selectedLevel === 'all') {
        JLPT_LEVELS.forEach((level) => delete next[level]);
      } else {
        delete next[selectedLevel];
      }
      return next;
    });
  };

    const reloadFrequencyData = () => {
      setFrequencyDataByRange((prev) => {
        const next = { ...prev };
        delete next[selectedFrequencyRange];
        return next;
      });
    };

  const handleCategoryChange = (category) => {
    setTimerActive(false);
    setSearchQuery('');
    setCurrentQuiz([]);
    setQuizIndex(0);
    setFeedback(null);
    setSaveState((prev) => ({ ...prev, selectedCategory: category }));
      setIsFrequencyFlipped(false);
      setFrequencySessionStarted(false);
    setScreen('home');
  };

  const handleLevelChange = (level) => {
    setTimerActive(false);
    setCurrentQuiz([]);
    setQuizIndex(0);
    setFeedback(null);
    setSaveState((prev) => ({ ...prev, selectedLevel: level }));
    setScreen('home');
  };

  const startQuestion = (word, currentIdx = quizIndex) => {
    if (!word) {
      if (currentIdx < currentQuiz.length - 1) {
        const nextIndex = currentIdx + 1;
        setQuizIndex(nextIndex);
        startQuestion(currentQuiz[nextIndex], nextIndex);
      } else {
        returnHome();
      }
      return;
    }

    setCurrentWord(word);
    setInputValue('');
    setFeedback(null);
    setSelectedAnswer(null);

    if (word.type === 'grammar') {
      if (!Array.isArray(word.options) || word.options.length < 2 || !isValidOption(word.correctAnswer)) {
        if (currentIdx < currentQuiz.length - 1) {
          const nextIndex = currentIdx + 1;
          setQuizIndex(nextIndex);
          startQuestion(currentQuiz[nextIndex], nextIndex);
        } else {
          returnHome();
        }
        return;
      }

      setQuizMode('grammar');
      setOptions(shuffleArray(word.options));
      setTimeLeft(10);
      setTimerActive(timerEnabled);
      return;
    }

    const hasValidReading = isValidOption(word.reading);
    const hasValidTurkish = isValidOption(word.turkish);

    if (!hasValidReading && !hasValidTurkish) {
      if (currentIdx < currentQuiz.length - 1) {
        const nextIndex = currentIdx + 1;
        setQuizIndex(nextIndex);
        startQuestion(currentQuiz[nextIndex], nextIndex);
      } else {
        returnHome();
      }
      return;
    }

    const availableModes = [];
    if (hasValidReading) {
      availableModes.push('reading', 'writing');
    }
    if (hasValidTurkish) {
      availableModes.push('turkish');
    }

    let eligibleModes = [];
    if (selectedModes.includes('mixed')) {
      eligibleModes = availableModes;
    } else {
      eligibleModes = selectedModes.filter((mode) => availableModes.includes(mode));
      if (eligibleModes.length === 0) {
        eligibleModes = availableModes;
      }
    }

    const mode = eligibleModes[Math.floor(Math.random() * eligibleModes.length)];
    setQuizMode(mode);

    const isOnlyWritingMode = selectedModes.length === 1 && selectedModes[0] === 'writing';
    setTimeLeft(isOnlyWritingMode ? 10 : 3);
    setTimerActive(timerEnabled);

    if (mode === 'writing') {
      setOptions([]);
      return;
    }

    let correctAnswer = mode === 'reading' ? word.reading : word.turkish;
    if (!isValidOption(correctAnswer)) {
      correctAnswer = word.turkish || word.reading || word.word;
    }

    setOptions(buildOptions(correctAnswer, mode));
  };

  const handleAnswer = (answer) => {
    if (!currentWord || feedback) return;

    setTimerActive(false);
    setSelectedAnswer(typeof answer === 'string' ? answer : null);

    let isCorrect = false;

    if (quizMode === 'reading') {
      isCorrect = answer === currentWord.reading;
    } else if (quizMode === 'turkish') {
      isCorrect = answer === currentWord.turkish;
    } else if (quizMode === 'writing') {
      isCorrect = toKana(inputValue.toLowerCase()) === currentWord.reading;
    } else if (quizMode === 'grammar') {
      isCorrect = answer === currentWord.correctAnswer;
    }

    setFeedback(isCorrect ? 'correct' : 'incorrect');

    const itemKey = getQuizItemKey(currentWord);
    setSaveState((prev) => ({
      ...prev,
      progress: {
        ...prev.progress,
        [itemKey]: {
          ...prev.progress[itemKey],
          attempts: (prev.progress[itemKey]?.attempts || 0) + 1,
          correct: (prev.progress[itemKey]?.correct || 0) + (isCorrect ? 1 : 0)
        }
      }
    }));

    setTimeout(() => {
      if (quizIndex < currentQuiz.length - 1) {
        const nextIndex = quizIndex + 1;
        setQuizIndex(nextIndex);
        startQuestion(currentQuiz[nextIndex], nextIndex);
      } else {
        returnHome();
      }
    }, 3500);
  };

  const clearAllData = () => {
    if (!window.confirm('Tüm ilerlemenizi silmek istediğinizden emin misiniz?')) return;
    localStorage.removeItem('kanji_save_state');
    setSaveState(defaultSaveState);
    window.location.reload();
  };

    const startFrequencySession = () => {
      if (selectedFrequencyCards.length === 0) {
        alert('Bu aralıkta gösterilecek kart bulunamadı.');
        return;
      }

      const deck = frequencyOrder === 'random'
        ? shuffleArray(selectedFrequencyCards)
        : [...selectedFrequencyCards].sort((a, b) => a.rank - b.rank);

      setFrequencyDeck(deck);
      setFrequencyIndex(0);
      setIsFrequencyFlipped(false);
      setFrequencySessionStarted(true);
      setScreen('frequency');
    };

    const handleFrequencyAssessment = (status) => {
      if (!currentFrequencyCard) return;

      setFrequencyKnown((prev) => ({
        ...prev,
        [currentFrequencyCard.id]: status
      }));

      if (frequencyIndex < frequencyDeck.length - 1) {
        setFrequencyIndex((prev) => prev + 1);
        setIsFrequencyFlipped(false);
        return;
      }

      returnHome();
    };

  const renderSectionCard = (section, sectionIndex = null) => {
    const sectionProgress = getSectionProgress(section);

    if (section.category === 'grammar') {
      return (
        <div
          key={section.id}
          className="block-card grammar-set"
          onClick={() => startQuiz(section, sectionIndex)}
        >
          <div className="block-header">
            <h4 className="block-title">{section.title}</h4>
            <span className="block-status">{section.level}</span>
          </div>
          <div className="block-subtitle">{section.subtitle}</div>
          <div className="grammar-preview">
            {section.previewQuestions.map((question) => (
              <div key={question.id} className="grammar-preview-item">
                {question.question}
              </div>
            ))}
          </div>
          <div className="block-progress">
            {sectionProgress.completed}/{sectionProgress.total} soru • %{sectionProgress.percentage}
          </div>
        </div>
      );
    }

    return (
      <div
        key={section.id}
        className={`block-card ${section.type} ${section.type === 'kanji' && completedKanjis.has(section.kanji.kanji) ? 'completed' : ''}`}
        onClick={() => startQuiz(section, sectionIndex)}
      >
        <div className="block-header">
          <h4 className="block-title">{section.title}</h4>
          <span className="block-status">
            {section.type === 'mini-boss' && '🔥 Mini Boss'}
            {section.type === 'big-boss' && '👹 Büyük Boss'}
            {section.type === 'kanji' && completedKanjis.has(section.kanji.kanji) && '✅'}
            {section.type === 'kanji' && !completedKanjis.has(section.kanji.kanji) && section.kanji.kanji}
          </span>
        </div>

        {section.subtitle && <div className="block-subtitle">{section.subtitle}</div>}

        {section.type === 'kanji' ? (
          <>
            <div className="block-kanji single">
              <span
                className="mini-kanji large"
                onClick={(event) => {
                  event.stopPropagation();
                  goToKanjiDetail(section.kanji);
                }}
              >
                {section.kanji.kanji}
              </span>
            </div>
            <div className="vocab-preview">
              {section.words.slice(0, 2).map((word) => (
                <div key={`${section.id}-${word.word}`} className="vocab-preview-item">
                  {word.word}
                </div>
              ))}
              {section.words.length > 2 && (
                <div className="vocab-preview-more">+{section.words.length - 2} daha</div>
              )}
            </div>
          </>
        ) : (
          <div className="boss-kanji-list">
            {section.kanjiList.map((kanji) => (
              <span
                key={`${section.id}-${kanji.kanji}`}
                className="mini-kanji"
                onClick={(event) => {
                  event.stopPropagation();
                  goToKanjiDetail(kanji);
                }}
              >
                {kanji.kanji}
              </span>
            ))}
          </div>
        )}

        <div className="block-progress">
          {sectionProgress.completed}/{sectionProgress.total} kelime • %{sectionProgress.percentage}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      {screen === 'home' && (
        <div className="home-screen">
          {continueSection && (
            <div className="continue-section">
              <button className="continue-btn" onClick={() => startQuiz(continueSection, lastSectionIndex)}>
                📚 Devam Et: {continueSection.title}
              </button>
            </div>
          )}

          <div className="section">
            <h3 className="section-title">KATEGORİ</h3>
            <div className="mode-buttons">
              <button
                className={`mode-btn ${selectedCategory === 'vocab' ? 'active' : ''}`}
                onClick={() => handleCategoryChange('vocab')}
              >
                Kanji / Kelime
              </button>
              <button
                className={`mode-btn ${selectedCategory === 'grammar' ? 'active' : ''}`}
                onClick={() => handleCategoryChange('grammar')}
              >
                Cümle Tamamlama
              </button>
                <button
                  className={`mode-btn ${selectedCategory === 'frequency' ? 'active' : ''}`}
                  onClick={() => handleCategoryChange('frequency')}
                >
                  Frekans Kartları
                </button>
            </div>
          </div>

            {selectedCategory !== 'frequency' && (
              <div className="search-section">
                <input
                  type="text"
                  className="search-input"
                  placeholder={
                    selectedCategory === 'grammar'
                      ? '🔍 Set, cümle veya cevap ara...'
                      : '🔍 Kanji, kelime, okunuş, anlam ara...'
                  }
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            )}

          {selectedCategory === 'vocab' && (
            <div className="section">
              <h3 className="section-title">SORU MODLARI</h3>
              <div className="mode-buttons">
                <button
                  className={`mode-btn ${selectedModes.includes('mixed') ? 'active' : ''}`}
                  onClick={() => {
                    if (!selectedModes.includes('mixed')) {
                      setSaveState((prev) => ({ ...prev, selectedModes: ['mixed'] }));
                    }
                  }}
                >
                  Karışık
                </button>
                <button
                  className={`mode-btn ${selectedModes.includes('turkish') && !selectedModes.includes('mixed') ? 'active' : ''}`}
                  onClick={() => {
                    let newModes;
                    if (selectedModes.includes('turkish')) {
                      newModes = selectedModes.filter((mode) => mode !== 'turkish');
                      if (newModes.length === 0) newModes = ['mixed'];
                    } else {
                      newModes = selectedModes.filter((mode) => mode !== 'mixed');
                      newModes.push('turkish');
                    }
                    setSaveState((prev) => ({ ...prev, selectedModes: newModes }));
                  }}
                >
                  Türkçe Anlam
                </button>
                <button
                  className={`mode-btn ${selectedModes.includes('reading') && !selectedModes.includes('mixed') ? 'active' : ''}`}
                  onClick={() => {
                    let newModes;
                    if (selectedModes.includes('reading')) {
                      newModes = selectedModes.filter((mode) => mode !== 'reading');
                      if (newModes.length === 0) newModes = ['mixed'];
                    } else {
                      newModes = selectedModes.filter((mode) => mode !== 'mixed');
                      newModes.push('reading');
                    }
                    setSaveState((prev) => ({ ...prev, selectedModes: newModes }));
                  }}
                >
                  Okunuş
                </button>
                <button
                  className={`mode-btn ${selectedModes.includes('writing') && !selectedModes.includes('mixed') ? 'active' : ''}`}
                  onClick={() => {
                    let newModes;
                    if (selectedModes.includes('writing')) {
                      newModes = selectedModes.filter((mode) => mode !== 'writing');
                      if (newModes.length === 0) newModes = ['mixed'];
                    } else {
                      newModes = selectedModes.filter((mode) => mode !== 'mixed');
                      newModes.push('writing');
                    }
                    setSaveState((prev) => ({ ...prev, selectedModes: newModes }));
                  }}
                >
                  Yazma
                </button>
              </div>
            </div>
          )}

            {selectedCategory !== 'frequency' && (
              <div className="section">
                <h3 className="section-title">SEVİYE FİLTRESİ</h3>
                <div className="mode-buttons">
                  {['all', ...JLPT_LEVELS].map((level) => (
                    <button
                      key={level}
                      className={`mode-btn ${selectedLevel === level ? 'active' : ''}`}
                      onClick={() => handleLevelChange(level)}
                    >
                      {level === 'all' ? 'Tümü' : level}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedCategory !== 'frequency' && (
              <div className="section">
                <button
                  className={`timer-toggle-btn ${timerEnabled ? 'active' : ''}`}
                  onClick={() => setSaveState((prev) => ({ ...prev, timerEnabled: !prev.timerEnabled }))}
                >
                  {timerEnabled ? '⏱️ Süre Sınırı: Açık' : '⏱️ Süre Sınırı: Kapalı'}
                </button>
              </div>
            )}

          {selectedCategory === 'grammar' && (
            <div className="section">
              <div className="grammar-info-card">
                <strong>Lazy load aktif.</strong> Dilbilgisi verisi sadece bu kategoriye geçtiğinizde ve seçtiğiniz seviyeye göre yüklenir.
                {grammarLoadError && (
                  <div className="grammar-error">
                    {grammarLoadError}
                    <button className="retry-btn" onClick={reloadGrammarData}>
                      Tekrar dene
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

            {selectedCategory === 'frequency' && (
              <>
                <div className="section">
                  <div className="grammar-info-card frequency-info-card">
                    <strong>Lazy load aktif.</strong> Frekans kartları yalnızca seçtiğin aralık açıldığında CSV üzerinden yüklenir.
                    {frequencyLoadError && (
                      <div className="grammar-error">
                        {frequencyLoadError}
                        <button className="retry-btn" onClick={reloadFrequencyData}>
                          Tekrar dene
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="section">
                  <h3 className="section-title">RANK ARALIĞI</h3>
                  <div className="frequency-controls">
                    <select
                      className="frequency-select"
                      value={selectedFrequencyRange}
                      onChange={(event) => setSelectedFrequencyRange(event.target.value)}
                    >
                      {FREQUENCY_RANGES.map((range) => (
                        <option key={range.id} value={range.id}>
                          {range.label}
                        </option>
                      ))}
                    </select>
                    <div className="mode-buttons">
                      <button
                        className={`mode-btn ${frequencyOrder === 'random' ? 'active' : ''}`}
                        onClick={() => setFrequencyOrder('random')}
                      >
                        Rastgele
                      </button>
                      <button
                        className={`mode-btn ${frequencyOrder === 'ordered' ? 'active' : ''}`}
                        onClick={() => setFrequencyOrder('ordered')}
                      >
                        Rank Sırası
                      </button>
                    </div>
                  </div>
                </div>

                <div className="section">
                  <div className="frequency-summary-card">
                    <div className="frequency-summary-row">
                      <span>Yüklenen kart</span>
                      <strong>{selectedFrequencyCards.length}</strong>
                    </div>
                    <div className="frequency-summary-row">
                      <span>Son oturum</span>
                      <strong>{frequencySessionStarted ? `${frequencyStats.known} biliyordum / ${frequencyStats.unknown} bilmiyordum` : 'Henüz başlamadı'}</strong>
                    </div>
                  </div>
                </div>

                <div className="section">
                  <button
                    className="random-50-btn"
                    onClick={startFrequencySession}
                    disabled={frequencyLoading}
                  >
                    🃏 Frekans Kartlarını Başlat
                    <span className="random-count">
                      ({selectedFrequencyCards.length} kart)
                    </span>
                  </button>
                </div>
              </>
            )}

            {selectedCategory !== 'frequency' && (
              <div className="section">
                <button className="review-mode-btn" onClick={startReviewMode}>
                  🎯 Hata Yaptıklarımı Tekrarla
                  <span className="review-count">
                    ({reviewWords.length} {reviewItemLabel})
                  </span>
                </button>
              </div>
            )}

            {selectedCategory !== 'frequency' && (
              <div className="section">
                <button className="random-50-btn" onClick={startRandomQuiz}>
                  🎲 Rastgele 50
                  <span className="random-count">
                    ({Math.min(50, randomPool.length)} {reviewItemLabel})
                  </span>
                </button>
              </div>
            )}

          {selectedCategory === 'vocab' && (
            <div className="section">
              <div className="section-header">
                <h3 className="section-title">ÖZEL GRUPLAR</h3>
                <button
                  className="create-group-btn"
                  onClick={() => setIsCreateGroupModalOpen(true)}
                >
                  ➕ Grup Oluştur
                </button>
              </div>

              {saveState.customGroups && saveState.customGroups.length > 0 ? (
                <div className="blocks-grid">
                  {saveState.customGroups.map((group) => {
                    const groupProgress = getSectionProgress({ words: filterVocabulary(group.words || []) });
                    return (
                      <div
                        key={group.id}
                        className="block-card custom-group"
                        onClick={() => startCustomGroupQuiz(group)}
                      >
                        <div className="block-header">
                          <h4 className="block-title">{group.name}</h4>
                          <button
                            className="delete-group-btn"
                            onClick={(event) => deleteCustomGroup(group.id, event)}
                          >
                            🗑️
                          </button>
                        </div>
                        <div className="custom-group-kanjis">
                          {group.kanjis.map((kanji) => (
                            <span key={`${group.id}-${kanji.kanji}`} className="mini-kanji small">
                              {kanji.kanji}
                            </span>
                          ))}
                        </div>
                        <div className="block-progress">
                          {groupProgress.completed}/{groupProgress.total} kelime • %{groupProgress.percentage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                  Henüz özel grup oluşturmadınız!
                </p>
              )}
            </div>
          )}

            {selectedCategory !== 'frequency' && (
            <div className="section">
            <div className="section-header">
              <h3 className="section-title">
                {selectedCategory === 'grammar' ? 'PRACTICE SETLERİ' : 'BÖLÜMLER'}
              </h3>
              <div className="header-actions">
                <div className="progress-summary">
                  {totalStats.completed}/{totalStats.total} {reviewItemLabel} tamamlandı
                </div>
                <button className="clear-btn" onClick={clearAllData}>
                  🗑️ Sıfırla
                </button>
              </div>
            </div>

            {selectedCategory === 'grammar' && grammarLoading && grammarSections.length === 0 && (
              <div className="empty-state-card">Dilbilgisi verisi yükleniyor...</div>
            )}

            {selectedCategory === 'grammar' && !grammarLoading && grammarSections.length === 0 && !grammarLoadError && (
              <div className="empty-state-card">Bu seviyede gösterilecek soru bulunamadı.</div>
            )}

            {searchQuery ? (
              <div className="blocks-grid">
                {filteredSections.map((section) =>
                  renderSectionCard(
                    section,
                    section.category === 'vocab' ? vocabSections.indexOf(section) : null
                  )
                )}
              </div>
            ) : (
              <div className="groups-container">
                {activeGroups.map((group, index) => {
                  const hasExplicitOpen = expandedGroups.includes(group.id);
                  const shouldAutoExpand =
                    index === 0 &&
                    !expandedGroups.some((value) =>
                      selectedCategory === 'grammar' ? value.startsWith('grammar') : value.length === 1
                    );
                  const isExpanded = hasExplicitOpen || shouldAutoExpand;

                  return (
                    <div key={group.id} className="group-card">
                      <button className="group-header" onClick={() => toggleGroup(group.id)}>
                        <span className="group-title">{group.title}</span>
                        <span className={`group-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
                      </button>

                      {isExpanded && (
                        <div className="group-content">
                          <div className="blocks-grid">
                            {group.sections.map((section) =>
                              renderSectionCard(
                                section,
                                section.category === 'vocab' ? vocabSections.indexOf(section) : null
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            )}
        </div>
      )}

        {screen === 'frequency' && currentFrequencyCard && (
          <div className="quiz-screen">
            <button className="back-btn" onClick={returnHome}>
              ← Geri
            </button>

            <div className="quiz-progress">
              {frequencyIndex + 1}/{frequencyDeck.length}
            </div>

            <div className="frequency-session-header">
              <span className="grammar-badge">#{currentFrequencyCard.rank}</span>
              <span className="grammar-badge secondary">{selectedFrequencyRange}</span>
              <span className="grammar-badge secondary">{frequencyOrder === 'random' ? 'Rastgele' : 'Sıralı'}</span>
            </div>

            <button
              type="button"
              className={`frequency-card ${isFrequencyFlipped ? 'flipped' : ''}`}
              onClick={() => setIsFrequencyFlipped((prev) => !prev)}
            >
              {isFrequencyFlipped ? (
                <div className="frequency-card-face frequency-card-back">
                  <div className="frequency-card-label">Arka Yüz</div>
                  <div className="frequency-reading">{currentFrequencyCard.reading}</div>
                  <div className="frequency-meaning">{currentFrequencyCard.meaning}</div>
                </div>
              ) : (
                <div className="frequency-card-face frequency-card-front">
                  <div className="frequency-card-label">Ön Yüz</div>
                  <div className="frequency-word">{currentFrequencyCard.word}</div>
                  <div className="frequency-hint">Kartı çevir</div>
                </div>
              )}
            </button>

            <div className="frequency-actions">
              <button
                className="option-btn secondary-action"
                onClick={() => setIsFrequencyFlipped((prev) => !prev)}
              >
                {isFrequencyFlipped ? 'Ön Yüze Dön' : 'Cevabı Göster'}
              </button>
            </div>

            <div className="frequency-actions">
              <button
                className="option-btn frequency-unknown-btn"
                onClick={() => handleFrequencyAssessment('unknown')}
              >
                Bilmiyordum
              </button>
              <button
                className="option-btn frequency-known-btn"
                onClick={() => handleFrequencyAssessment('known')}
              >
                Biliyordum
              </button>
            </div>
          </div>
        )}

      {screen === 'quiz' && currentWord && (
        <div className="quiz-screen">
          <button className="back-btn" onClick={returnHome}>
            ← Geri
          </button>

          <div className="quiz-progress">
            {quizIndex + 1}/{currentQuiz.length}
            {!feedback && timerEnabled && (
              <div className={`timer ${timeLeft <= 1 ? 'urgent' : ''}`}>
                ⏱️ {timeLeft}s
              </div>
            )}
          </div>

          <div className="question-card">
            {currentWord.type === 'grammar' ? (
              <>
                <div className="grammar-meta">
                  <span className="grammar-badge">{currentWord.level}</span>
                  <span className="grammar-badge secondary">{currentWord.practiceSet}</span>
                </div>
                <div className="grammar-question">{currentWord.question}</div>
              </>
            ) : (
              <>
                <div className="kanji-display">{currentWord.kanji}</div>
                <div className="word-display">{currentWord.word}</div>
              </>
            )}

            {!feedback ? (
              <>
                {quizMode === 'reading' && (
                  <div className="mode-section">
                    <h3>Okunuşunu seçin:</h3>
                    <div className="options-grid">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          className="option-btn"
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
                      {options.map((opt) => (
                        <button
                          key={opt}
                          className="option-btn"
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
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && !feedback && handleAnswer()}
                      className="reading-input"
                      disabled={feedback}
                      placeholder="Örnek: genki"
                    />
                    <div className="kana-preview">{toKana(inputValue.toLowerCase())}</div>
                    <button className="submit-btn" onClick={() => handleAnswer()}>
                      Gönder
                    </button>
                  </div>
                )}

                {quizMode === 'grammar' && (
                  <div className="mode-section">
                    <h3>Boşluğu doğru seçenekle tamamlayın:</h3>
                    <div className="options-grid">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          className="option-btn"
                          onClick={() => handleAnswer(opt)}
                          disabled={feedback}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="feedback-details-centered">
                <div className={`feedback ${feedback}`}>
                  {feedback === 'correct' ? '✓ Doğru!' : '✗ Yanlış!'}
                </div>

                {currentWord.type === 'grammar' ? (
                  <div className="word-details grammar-word-details">
                    <div className="detail-word">{currentWord.correctAnswer}</div>
                    <div className="detail-reading grammar-full-sentence">
                      {currentWord.questionWithAnswer}
                    </div>
                    {selectedAnswer && feedback === 'incorrect' && (
                      <div className="detail-meaning">Seçtiğin: {selectedAnswer}</div>
                    )}
                  </div>
                ) : (
                  <div className="word-details">
                    <div className="detail-word">{currentWord.word}</div>
                    <div className="detail-reading">Okunuş: {currentWord.reading}</div>
                    <div className="detail-meaning">Türkçe: {currentWord.turkish}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'kanjiDetail' && selectedKanji && (
        <div className="detail-screen">
          <button className="back-btn" onClick={returnHome}>
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
                {selectedKanji.vocabulary.map((vocab) => {
                  const word = { ...vocab, kanji: selectedKanji.kanji };
                  const key = `${selectedKanji.kanji}-${vocab.word}`;
                  const wordProgress = progress[key];
                  const isCompleted = completedWords.has(key);

                  return (
                    <div key={key} className={`vocab-item ${isCompleted ? 'completed' : ''}`}>
                      <div>
                        <div className="vocab-word">{vocab.word}</div>
                        <div className="vocab-reading">{vocab.reading}</div>
                        <div className="vocab-meaning">{vocab.turkish}</div>
                        {wordProgress && (
                          <div className="vocab-progress">
                            {wordProgress.correct}/{wordProgress.attempts} doğru
                          </div>
                        )}
                      </div>

                      {!isCompleted && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleWordComplete(word);
                          }}
                          style={{
                            backgroundColor: '#4caf50',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            marginTop: '8px'
                          }}
                        >
                          ✅ Tamamla
                        </button>
                      )}

                      {isCompleted && (
                        <div style={{ color: '#4caf50', fontWeight: 'bold', marginTop: '8px' }}>
                          ✅ Tamamlandı
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
                const words = (selectedKanji.vocabulary || []).map((vocab) => ({
                  ...vocab,
                  kanji: selectedKanji.kanji
                }));
                startQuizSession(words);
              }}
            >
              Bu kanjiyle pratik yap
            </button>

            {!completedKanjis.has(selectedKanji.kanji) && (
              <button
                className="practice-btn"
                onClick={handleKanjiComplete}
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                ✅ Bu kanjiyi tamamladım
              </button>
            )}

            {completedKanjis.has(selectedKanji.kanji) && (
              <div style={{ color: 'var(--accent-color)', marginTop: '1rem', fontWeight: 'bold' }}>
                ✅ Bu kanji tamamlandı!
              </div>
            )}
          </div>
        </div>
      )}

      {isCreateGroupModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateGroupModalOpen(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Yeni Grup Oluştur</h2>
              <button
                className="close-modal-btn"
                onClick={() => setIsCreateGroupModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Grup Adı:</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="Örn: Kitap Bölüm 1"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>
                  Kanji Seçin ({selectedKanjisForGroup.length}/8):
                  {selectedKanjisForGroup.length < 6 && (
                    <span style={{ color: '#f87171', marginLeft: '8px' }}>
                      (En az 6 kanji seçin!)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={groupSearchQuery}
                  onChange={(event) => setGroupSearchQuery(event.target.value)}
                  placeholder="Kanji ara..."
                  className="form-input"
                />
              </div>

              <div className="kanji-select-grid">
                {kanjiData
                  .filter((kanji) => {
                    if (!groupSearchQuery) return true;
                    const query = groupSearchQuery.toLowerCase();
                    return (
                      kanji.kanji.includes(groupSearchQuery) ||
                      (kanji.vocabulary || []).some((vocab) =>
                        vocab.word.toLowerCase().includes(query) ||
                        String(vocab.reading || '').toLowerCase().includes(query) ||
                        String(vocab.turkish || '').toLowerCase().includes(query)
                      )
                    );
                  })
                  .map((kanji) => {
                    const isSelected = selectedKanjisForGroup.some((item) => item.kanji === kanji.kanji);
                    return (
                      <div
                        key={kanji.kanji}
                        className={`kanji-select-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleKanjiForGroup(kanji)}
                      >
                        <span className="kanji-char">{kanji.kanji}</span>
                        {isSelected && <span className="checkmark">✓</span>}
                      </div>
                    );
                  })}
              </div>

              {selectedKanjisForGroup.length > 0 && (
                <div className="selected-kanjis-preview">
                  <h4>Seçilen Kanji:</h4>
                  <div className="selected-kanjis-list">
                    {selectedKanjisForGroup.map((kanji) => (
                      <span key={kanji.kanji} className="selected-kanji-tag">
                        {kanji.kanji}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setIsCreateGroupModalOpen(false)}
              >
                İptal
              </button>
              <button className="create-btn" onClick={createCustomGroup}>
                Grup Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
