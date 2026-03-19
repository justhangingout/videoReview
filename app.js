import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Search, Plus, Trash2, Star, XCircle, AlertTriangle, CheckCircle, Sparkles, Wand2, X, Loader, GripVertical } from 'lucide-react';

// --- Firebase Configuration & Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDZNs3AvTPsVK3Dn6B7OAgRIvnvTdJgI5Q",
  authDomain: "coles-show-review-app.firebaseapp.com",
  projectId: "coles-show-review-app",
  storageBucket: "coles-show-review-app.firebasestorage.app",
  messagingSenderId: "974478749981",
  appId: "1:974478749981:web:87fc3e016a209c3102f1f4",
  measurementId: "G-XBNXQYKRR9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Draggable Item Type ---
const ItemType = 'SHOW';

// --- Star Rating Component ---
const StarRating = ({ score, onSetScore }) => {
    return (
        <div className="flex items-center">
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    onClick={() => onSetScore(star)}
                    className={`cursor-pointer transition-colors ${
                        score >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500'
                    }`}
                    size={22}
                />
            ))}
        </div>
    );
};

// --- Draggable Watchlist Item ---
const DraggableWatchlistItem = ({ show, index, moveShow, onRemove, onShowClick }) => {
  const ref = useRef(null);
  const [, drop] = useDrop({
    accept: ItemType,
    hover(item, monitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      moveShow(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemType,
    item: { id: show.id, index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });
  
  drag(drop(ref));

  return (
    <div ref={preview} style={{ opacity: isDragging ? 0.5 : 1 }} className="flex items-center bg-gray-700 p-2 rounded-lg mb-2 shadow-md hover:bg-gray-600 transition-colors">
       <div ref={ref} className="cursor-move p-2"><GripVertical className="text-gray-400" /></div>
       <div className="flex-grow flex items-center cursor-pointer" onClick={() => onShowClick(show)}>
            <img src={show.poster || 'https://placehold.co/50x75/1a202c/ffffff?text=?'} alt={show.title} className="w-10 h-14 object-cover rounded-md mr-4" />
            <div>
                <h3 className="font-bold text-white">{show.title}</h3>
                <p className="text-sm text-gray-400">{show.year}</p>
            </div>
       </div>
       <button onClick={() => onRemove(show.id, 'watchlist')} className="p-2 rounded-full hover:bg-red-500/20 text-red-500 hover:text-red-400 transition-colors"><Trash2 size={18} /></button>
    </div>
  );
};


// --- Scored Show Item (Not Draggable) ---
const ScoredShowItem = ({ show, onRemove, onShowClick, onScoreChange }) => {
  return (
    <div className="flex items-center bg-gray-700 p-2 rounded-lg mb-2 shadow-md hover:bg-gray-600 transition-colors">
      <div className="flex-grow flex items-center cursor-pointer" onClick={() => onShowClick(show)}>
        <img src={show.poster || 'https://placehold.co/50x75/1a202c/ffffff?text=?'} alt={show.title} className="w-10 h-14 object-cover rounded-md mr-4" />
        <div>
          <h3 className="font-bold text-white">{show.title}</h3>
          <p className="text-sm text-gray-400">{show.year}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <StarRating score={show.score} onSetScore={(newScore) => onScoreChange(show.id, newScore)} />
        <button onClick={() => onRemove(show.id, 'scoredList')} className="p-2 rounded-full hover:bg-red-500/20 text-red-500 hover:text-red-400 transition-colors"><Trash2 size={18} /></button>
      </div>
    </div>
  );
};


// --- Show Details Modal ---
const ShowDetailsModal = ({ show, isOpen, onClose, details, isGeneratingDetails, onAddToList, onRemoveFromList, onScoreChange, onNotesChange, watchlist, scoredList }) => {
    if (!isOpen || !show) return null;

    const isInWatchlist = watchlist.some(s => s.id === show.id);
    const scoredShow = scoredList.find(s => s.id === show.id);
    const isInScoredList = !!scoredShow;

    const [editedNotes, setEditedNotes] = useState(scoredShow?.notes || '');

    useEffect(() => {
        if (!isInScoredList) return;
        const handler = setTimeout(() => {
            if (scoredShow?.notes !== editedNotes) {
                onNotesChange(show.id, editedNotes);
            }
        }, 1000);

        return () => { clearTimeout(handler); };
    }, [editedNotes, onNotesChange, show.id, scoredShow, isInScoredList]);
    
    useEffect(() => {
        setEditedNotes(scoredShow?.notes || '');
    }, [show, scoredShow]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col md:flex-row relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors z-10"><X size={24}/></button>
                <img src={show.poster} alt={show.title} className="w-full md:w-1/3 h-64 md:h-auto object-cover rounded-t-xl md:rounded-l-xl md:rounded-t-none"/>
                <div className="p-6 flex-grow flex flex-col overflow-y-auto">
                    <h2 className="text-3xl font-bold text-white mb-2">{show.title}</h2>
                    <p className="text-lg text-gray-400 mb-4">{show.year}</p>
                    <div className="flex-grow min-h-[100px]">
                        {isGeneratingDetails ? (
                           <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2"/> Generating summary...</div>
                        ) : ( <p className="text-gray-300">{details}</p> )}
                    </div>

                    {isInScoredList && (
                        <div className="py-4 border-t border-gray-700 space-y-4">
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Your Rating</h4>
                                <StarRating score={scoredShow.score} onSetScore={(newScore) => onScoreChange(show.id, newScore)} />
                            </div>
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-2">My Notes</h4>
                                <textarea
                                    value={editedNotes}
                                    onChange={(e) => setEditedNotes(e.target.value)}
                                    placeholder="What did you like or dislike?"
                                    className="w-full bg-gray-700 border-2 border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                    rows="3"
                                ></textarea>
                            </div>
                        </div>
                    )}
                     <div className="flex flex-wrap gap-2 py-4 border-t border-gray-700">
                        <h4 className="text-lg font-semibold text-white w-full mb-1">Available on:</h4>
                        {show.services && show.services.length > 0 ? (
                            show.services.map(service => (
                                <span key={service} className="bg-gray-600 text-white px-3 py-1 rounded-full text-sm">{service}</span>
                            ))
                        ) : ( <p className="text-gray-400">Streaming info varies by region.</p> )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-4 mt-auto border-t border-gray-700">
                        {isInWatchlist ? 
                            <button onClick={() => onRemoveFromList(show.id, 'watchlist')} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Remove from Watchlist</button> : 
                            <button onClick={() => onAddToList(show, 'watchlist')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Add to Watchlist</button>
                        }
                        {isInScoredList ? 
                            <button onClick={() => onRemoveFromList(show.id, 'scoredList')} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Remove from Scored</button> :
                            <button onClick={() => onAddToList(show, 'scoredList')} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Add to Scored List</button>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Notification Component ---
const Notification = ({ message, type, onDismiss }) => {
    if (!message) return null;
    const styles = { error: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500', success: 'bg-green-500' };
    const Icon = { error: XCircle, warning: AlertTriangle, info: AlertTriangle, success: CheckCircle }[type];
    return (
        <div className={`fixed bottom-5 right-5 flex items-center p-4 rounded-lg text-white shadow-lg z-50 ${styles[type]}`}>
            <Icon className="mr-3" size={24} /><p>{message}</p>
            <button onClick={onDismiss} className="ml-4 p-1 rounded-full hover:bg-white/20"><XCircle size={20} /></button>
        </div>
    );
};

// --- Main App Component ---
function App() {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [scoredList, setScoredList] = useState([]);
  const [popularShows, setPopularShows] = useState([]);
  const [availableProviders, setAvailableProviders] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [isLoadingPopular, setIsLoadingPopular] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('US');
  const [selectedYear, setSelectedYear] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('watchlist');
  const [friendId, setFriendId] = useState('');
  const [friendData, setFriendData] = useState(null);
  const [showMyId, setShowMyId] = useState(false);
  const [notification, setNotification] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isGenerating, setIsGenerating] = useState({ suggestions: false, summary: false, comparison: false, details: false });
  const [listSummary, setListSummary] = useState('');
  const [tasteComparison, setTasteComparison] = useState('');
  const [selectedShow, setSelectedShow] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDetails, setShowDetails] = useState('');

  const showNotification = (message, type = 'info', duration = 4000) => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), duration);
  };

  const fetchPopularShows = useCallback(async () => {
      if (TMDB_API_KEY === "YOUR_TMDB_API_KEY_HERE") {
          showNotification("Please add your TMDb API key to fetch shows.", "warning");
          setIsLoadingPopular(false); return;
      }
      setIsLoadingPopular(true);
      let url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&language=en-US&page=1&watch_region=${selectedRegion}`;
      if (selectedServices.length > 0) url += `&with_watch_providers=${selectedServices.join('|')}`;
      if (selectedYear && /^\d{4}$/.test(selectedYear)) url += `&first_air_date_year=${selectedYear}`;

      try {
          const response = await fetch(url);
          if (!response.ok) { throw new Error('Failed to fetch from TMDb'); }
          const data = await response.json();
          const formattedShows = data.results.map(show => ({
              id: `tmdb-${show.id}`,
              title: show.name,
              year: show.first_air_date ? show.first_air_date.split('-')[0] : 'N/A',
              poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : 'https://placehold.co/150x225/1a202c/ffffff?text=No+Image',
              services: [], 
          }));
          setPopularShows(formattedShows);
      } catch (error) { console.error("TMDb Fetch Error:", error); showNotification("Could not fetch popular shows.", "error"); }
      setIsLoadingPopular(false);
  }, [selectedServices, selectedRegion, selectedYear]);

  useEffect(() => { fetchPopularShows(); }, [fetchPopularShows]);
  
  const fetchProviders = useCallback(async () => {
        if (TMDB_API_KEY === "YOUR_TMDB_API_KEY_HERE") return;
        try {
            const response = await fetch(`https://api.themoviedb.org/3/watch/providers/tv?api_key=${TMDB_API_KEY}&watch_region=${selectedRegion}`);
            if (!response.ok) { throw new Error('Failed to fetch providers'); }
            const data = await response.json();
            const majorProviderIds = [8, 9, 337, 15, 384, 531, 1899, 2, 3, 10]; 
            const filteredProviders = data.results.filter(p => majorProviderIds.includes(p.provider_id)).sort((a,b) => a.display_priority - b.display_priority);
            setAvailableProviders(filteredProviders);
        } catch (error) { console.error("TMDb Provider Fetch Error:", error); showNotification(`Could not fetch streaming services for ${selectedRegion}.`, "error"); setAvailableProviders([]); }
    }, [selectedRegion]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  useEffect(() => {
    const fetchRegions = async () => {
        if (TMDB_API_KEY === "YOUR_TMDB_API_KEY_HERE") return;
        try {
            const response = await fetch(`https://api.themoviedb.org/3/watch/providers/regions?api_key=${TMDB_API_KEY}`);
            if (!response.ok) { throw new Error('Failed to fetch regions'); }
            const data = await response.json();
            setAvailableRegions(data.results.sort((a,b) => a.english_name.localeCompare(b.english_name)));
        } catch (error) { console.error("TMDb Region Fetch Error:", error); showNotification("Could not fetch regions.", "error"); }
    };
    fetchRegions();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) { setUserId(user.uid); } 
      else {
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) { await signInWithCustomToken(auth, __initial_auth_token); } 
            else { await signInAnonymously(auth); }
        } catch (error) { console.error("Authentication Error:", error); showNotification("Authentication failed.", "error"); }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !userId) return;
    setIsLoading(true);
    const docRef = doc(db, 'artifacts', appId, 'users', userId);
    const unsubscribeData = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWatchlist(data.watchlist || []);
        setScoredList(data.scoredList || []);
      } else { setDoc(docRef, { watchlist: [], scoredList: [] }); }
      setIsLoading(false);
    }, (error) => { console.error("Firestore Snapshot Error:", error); showNotification("Could not load your lists.", "error"); setIsLoading(false); });
    return () => unsubscribeData();
  }, [isAuthReady, userId]);

  const callGeminiAPI = async (prompt, generationConfig) => {
      const apiKey = ""; 
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
      if(generationConfig) { payload.generationConfig = generationConfig; }
      try {
          const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!response.ok) { throw new Error(`API call failed with status: ${response.status}`); }
          const result = await response.json();
          if (result.candidates?.[0]?.content?.parts?.[0]) { return result.candidates[0].content.parts[0].text; } 
          else { throw new Error("Invalid response structure from API."); }
      } catch (error) { console.error("Gemini API Error:", error); showNotification("An error occurred while using the AI feature.", "error"); return null; }
  };
  
  const handleSuggestShows = async () => {
    setIsGenerating(p => ({ ...p, suggestions: true })); setAiSuggestions([]);
    const scoredTitles = scoredList.map(s => `${s.title} (${s.score}/5 stars)`).join(', ');
    const watchlistTitles = watchlist.map(s => s.title).join(', ');
    const prompt = `Based on the following TV shows, suggest 5 new shows to watch...`;
    const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { "title": { "type": "STRING" }, "year": { "type": "NUMBER" }, "reason": { "type": "STRING" }, "services": { "type": "ARRAY", "items": { "type": "STRING" } } }, required: ["title", "year", "reason", "services"] } };
    const resultText = await callGeminiAPI(prompt, { responseMimeType: "application/json", responseSchema: schema });
    if(resultText){ try { const suggestions = JSON.parse(resultText); setAiSuggestions(suggestions.map(s => ({...s, id: `ai-${s.title.replace(/\s+/g, '')}`}))); } catch(e) { console.error("Failed to parse AI suggestions:", e); showNotification("Could not understand AI suggestions.", "error"); }}
    setIsGenerating(p => ({ ...p, suggestions: false }));
  };
  const handleGenerateSummary = async () => {
      setIsGenerating(p => ({...p, summary: true})); setListSummary('');
      const scoredTitles = scoredList.map(s => `${s.title} (${s.score}/5 stars)`).join('\n');
      const prompt = `Here is my list of scored TV shows:\n${scoredTitles}\n\nBased on this list, write a short, fun, and witty summary (2-3 sentences) of my taste in television.`;
      const result = await callGeminiAPI(prompt);
      if(result) { setListSummary(result); }
      setIsGenerating(p => ({...p, summary: false}));
  };
  const handleCompareTastes = async () => {
      if(!friendData?.scoredList) return;
      setIsGenerating(p => ({...p, comparison: true})); setTasteComparison('');
      const myScores = scoredList.slice(0, 10).map(s => `${s.title} (${s.score}/5)`).join(', ');
      const friendScores = friendData.scoredList.slice(0, 10).map(s => `${s.title} (${s.score}/5)`).join(', ');
      const prompt = `My top shows are: ${myScores}. My friend's top shows are: ${friendScores}. Write a short, playful analysis comparing our tastes...`;
      const result = await callGeminiAPI(prompt);
      if(result) { setTasteComparison(result); }
      setIsGenerating(p => ({...p, comparison: false}));
  };
  const handleGenerateDetails = async (show) => {
      setIsGenerating(p => ({...p, details: true})); setShowDetails('');
      const prompt = `Provide a concise and engaging 2-3 sentence plot summary for the TV show/movie titled "${show.title}" which was released in ${show.year}.`;
      const result = await callGeminiAPI(prompt);
      if(result) { setShowDetails(result); }
      setIsGenerating(p => ({...p, details: false}));
  };

  const handleShowClick = (show) => { setSelectedShow(show); setIsModalOpen(true); handleGenerateDetails(show); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedShow(null); setShowDetails(''); };

  const updateFirestore = async (data) => {
    if (!userId) return;
    const docRef = doc(db, 'artifacts', appId, 'users', userId);
    try { await updateDoc(docRef, data); } 
    catch(error) { console.error("Firestore Update Error:", error); showNotification("Failed to save changes.", "error"); }
  };
  const loadFriendData = async () => {
    if (!friendId) { setFriendData(null); return; }
    setFriendData(null); setTasteComparison(''); setIsLoading(true);
    try {
        const friendDocRef = doc(db, 'artifacts', appId, 'users', friendId);
        const friendDocSnap = await getDoc(friendDocRef);
        if (friendDocSnap.exists()) { setFriendData(friendDocSnap.data()); } 
        else { showNotification("Friend ID not found.", "error"); setFriendData({ notFound: true }); }
    } catch (error) { console.error("Error fetching friend data:", error); showNotification("Could not fetch friend's data.", "error"); }
    setIsLoading(false);
  };
  const addToList = (show, listType) => {
    const isWatchlist = listType === 'watchlist';
    const list = isWatchlist ? watchlist : scoredList;
    const setList = isWatchlist ? setWatchlist : setScoredList;
    if (list.some(s => s.id === show.id)) { showNotification(`${show.title} is already in your ${isWatchlist ? 'Watchlist' : 'Scored List'}.`, "warning"); return; }
    const newShow = { ...show, poster: show.poster || `https://placehold.co/150x225/1a202c/ffffff?text=${show.title.replace(/\s/g, '+')}` };
    if (!isWatchlist) { newShow.score = 0; newShow.notes = ''; }
    const newList = [...list, newShow];
    setList(newList);
    updateFirestore({ [listType]: newList });
    showNotification(`Added ${show.title} to your ${isWatchlist ? 'Watchlist' : 'Scored List'}.`, 'success');
  };
  const removeFromList = (showId, listType) => {
    const isWatchlist = listType === 'watchlist';
    const list = isWatchlist ? watchlist : scoredList;
    const setList = isWatchlist ? setWatchlist : setScoredList;
    const show = list.find(s => s.id === showId);
    const newList = list.filter(s => s.id !== showId);
    setList(newList);
    updateFirestore({ [listType]: newList });
    if(show) { showNotification(`Removed ${show.title} from your ${isWatchlist ? 'Watchlist' : 'Scored List'}.`, 'success'); }
  };
  const handleScoreChange = (showId, newScore) => {
    const newList = scoredList.map(show => show.id === showId ? { ...show, score: newScore } : show);
    setScoredList(newList);
    updateFirestore({ scoredList: newList });
  };
    const handleNotesChange = (showId, newNotes) => {
    const newList = scoredList.map(show => show.id === showId ? { ...show, notes: newNotes } : show);
    setScoredList(newList);
    updateFirestore({ scoredList: newList });
    showNotification("Notes saved!", "success", 2000);
  };
  const handleServiceToggle = (providerId) => {
      setSelectedServices(prev => prev.includes(providerId) ? prev.filter(id => id !== providerId) : [...prev, providerId]);
  };
  
  const moveShowInWatchlist = (dragIndex, hoverIndex) => {
      const newList = [...watchlist];
      const draggedShow = newList[dragIndex];
      newList.splice(dragIndex, 1);
      newList.splice(hoverIndex, 0, draggedShow);
      setWatchlist(newList);
      updateFirestore({ watchlist: newList });
  };

  const showsToDiscover = useMemo(() => popularShows
    .filter(pShow => !watchlist.some(wShow => wShow.id === pShow.id) && !scoredList.some(sShow => sShow.id === pShow.id))
    .filter(show => show.title.toLowerCase().includes(searchTerm.toLowerCase())),
    [watchlist, scoredList, searchTerm, popularShows]);

  const renderFriendList = (list, listName) => {
      if (!list || list.length === 0) return <div className="text-center p-10 text-gray-400">{`Friend's ${listName} is empty.`}</div>;
      return (
        <div className="space-y-2">{list.map((show, index) => (
            <div key={show.id} onClick={() => handleShowClick(show)} className="flex items-center bg-gray-700 p-2 rounded-lg mb-2 shadow-md hover:bg-gray-600 transition-colors cursor-pointer">
                {listName === "Scored List" && show.score > 0 ? 
                  <div className="flex items-center w-20 mr-2"><Star className="text-yellow-400 fill-yellow-400 mr-1" size={16}/> <span className="font-bold text-white">{show.score}/5</span></div> :
                  <span className="text-lg font-bold text-gray-400 w-8 text-center">{index + 1}</span>
                }
                <img src={show.poster} alt={show.title} className="w-10 h-14 object-cover rounded-md mr-4" />
                <div className="flex-grow"><h3 className="font-bold text-white">{show.title}</h3><p className="text-sm text-gray-400">{show.year}</p></div>
            </div>
        ))}</div>
      );
  };

  if (!isAuthReady) {
    return <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center"><h1 className="text-4xl font-bold">Connecting to your Lists...</h1></div>;
  }

  return (
    <>
      <ShowDetailsModal {...{isOpen:isModalOpen, onClose:handleCloseModal, show:selectedShow, details:showDetails, isGeneratingDetails:isGenerating.details, onAddToList:addToList, onRemoveFromList:removeFromList, onScoreChange:handleScoreChange, onNotesChange: handleNotesChange, watchlist, scoredList}}/>
      <div className="bg-gray-900 text-white min-h-screen font-sans">
        <Notification message={notification?.message} type={notification?.type} onDismiss={() => setNotification(null)} />
        <div className="container mx-auto p-4 max-w-5xl">
          <header className="text-center my-8">
            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">Stream Ranker</h1>
            <p className="text-gray-400 mt-2">Your collaborative movie & TV show scoring hub.</p>
            <button onClick={() => setShowMyId(!showMyId)} className="mt-4 text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">{showMyId ? "Hide My ID" : "Show My ID"}</button>
            {showMyId && userId && (<div className="mt-4 p-3 bg-gray-800 rounded-lg"><p className="text-gray-300">Share this ID with your friends:</p><p className="font-mono bg-gray-900 p-2 rounded mt-1 break-all">{userId}</p></div>)}
          </header>

          <div className="bg-gray-800 rounded-xl p-6 mb-8 shadow-lg">
              <h2 className="text-2xl font-bold mb-4 text-white">View a Friend's Lists</h2>
              <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" value={friendId} onChange={(e) => setFriendId(e.target.value)} placeholder="Enter Friend's ID" className="flex-grow bg-gray-700 border-2 border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors" />
                  <button onClick={loadFriendData} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">Load Friend's Lists</button>
              </div>
              {friendData && !friendData.notFound && (
                  <div className="mt-6">
                      <div className="flex justify-between items-center flex-wrap gap-4">
                          <h3 className="text-xl font-bold text-purple-400">Viewing {friendId.substring(0,8)}...'s Lists</h3>
                          <button onClick={handleCompareTastes} disabled={isGenerating.comparison} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-500">
                            {isGenerating.comparison ? 'Analyzing...' : <> <Sparkles size={16}/> Compare Tastes </>}
                          </button>
                      </div>
                        {tasteComparison && <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-pink-500/50 text-gray-300 italic">{tasteComparison}</div>}
                      <div className="grid md:grid-cols-2 gap-6 mt-4">
                          <div>
                            <h4 className="font-bold text-lg mb-2 text-gray-300">Scored List</h4>
                            {renderFriendList(friendData.scoredList, "Scored List")}
                          </div>
                          <div>
                            <h4 className="font-bold text-lg mb-2 text-gray-300">Watchlist</h4>
                            {renderFriendList(friendData.watchlist, "Watchlist")}
                          </div>
                      </div>
                  </div>
              )}
          </div>

          <main className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 bg-gray-800 rounded-xl p-6 shadow-lg">
              <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
                <h2 className="text-2xl font-bold text-white">My Lists</h2>
                {activeTab === 'scored' && (<button onClick={handleGenerateSummary} disabled={isGenerating.summary || scoredList.length === 0} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">{isGenerating.summary ? 'Generating...' : <> <Wand2 size={16}/> Generate Summary </>}</button>)}
              </div>
              {listSummary && activeTab === 'scored' && <div className="mb-4 p-4 bg-gray-900/50 rounded-lg border border-blue-500/50 text-gray-300 italic">{listSummary}</div>}
              <div className="flex border-b border-gray-700 mb-4">
                <button onClick={() => setActiveTab('watchlist')} className={`py-2 px-4 font-semibold transition-colors ${activeTab === 'watchlist' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400 hover:text-white'}`}>My Watchlist</button>
                <button onClick={() => setActiveTab('scored')} className={`py-2 px-4 font-semibold transition-colors ${activeTab === 'scored' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400 hover:text-white'}`}>My Scored Shows</button>
              </div>
              {activeTab === 'watchlist' ? (
                <DndProvider backend={HTML5Backend}>
                  <div className="space-y-2">{watchlist.map((show, index) => ( <DraggableWatchlistItem key={show.id} index={index} show={show} moveShow={moveShowInWatchlist} onRemove={removeFromList} onShowClick={handleShowClick} /> ))}</div>
                </DndProvider>
              ) : (
                <div className="space-y-2">{scoredList.map((show) => (<ScoredShowItem key={show.id} show={show} onRemove={removeFromList} onShowClick={handleShowClick} onScoreChange={handleScoreChange}/>))}</div>
              )}
            </div>

            <div className="bg-gray-800 rounded-xl p-6 shadow-lg h-fit">
              <h2 className="text-2xl font-bold mb-4 text-white">Discover Shows</h2>
              <div className="relative mb-4">
                <input type="text" placeholder="Search for a show..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-gray-700 border-2 border-gray-600 rounded-lg p-3 pl-10 text-white focus:outline-none focus:border-purple-500 transition-colors" />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              </div>
               <div className="grid grid-cols-2 gap-2 mb-4">
                    <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} className="w-full bg-gray-700 border-2 border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500 transition-colors">
                        {availableRegions.map(region => (
                            <option key={region.iso_3166_1} value={region.iso_3166_1}>{region.english_name}</option>
                        ))}
                    </select>
                    <input type="number" placeholder="Year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full bg-gray-700 border-2 border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500" min="1900" max={new Date().getFullYear()}/>
               </div>
               <div className="flex flex-wrap gap-2 mb-4">
                    {availableProviders.map(provider => (
                        <button key={provider.provider_id} onClick={() => handleServiceToggle(provider.provider_id)}
                            className={`p-1 rounded-md transition-colors ${selectedServices.includes(provider.provider_id) ? 'bg-purple-600 ring-2 ring-white' : 'bg-gray-600 hover:bg-gray-500'}`}>
                            <img src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt={provider.provider_name} className="w-10 h-10 rounded-md object-cover"/>
                        </button>
                    ))}
                </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2 mb-4">
                {isLoadingPopular ? (
                    <div className="flex justify-center items-center p-10"><Loader className="animate-spin text-white" /></div>
                ) : showsToDiscover.length > 0 ? ( showsToDiscover.map(show => (
                    <div key={show.id} onClick={() => handleShowClick(show)} className="flex items-center bg-gray-700 p-2 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer">
                      <img src={show.poster} alt={show.title} className="w-10 h-14 object-cover rounded-md mr-3" />
                      <div className="flex-grow">
                        <h4 className="font-semibold text-white">{show.title}</h4>
                        <p className="text-sm text-gray-400">{show.year}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={(e) => { e.stopPropagation(); addToList(show, 'scoredList'); }} className="p-2 rounded-full bg-gray-600 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-colors" title="Add to Scored List"><Star size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); addToList(show, 'watchlist'); }} className="p-2 rounded-full bg-gray-600 hover:bg-green-500/20 text-green-400 hover:text-green-300 transition-colors" title="Add to Watchlist"><Plus size={16} /></button>
                      </div>
                    </div>
                  ))) : (
                  <p className="text-gray-400 text-center p-4">
                    {searchTerm || selectedServices.length > 0 || selectedYear ? "No shows match your filters." : "All discoverable shows are in your lists."}
                  </p>
                )}
              </div>
              <div className="border-t border-gray-700 pt-4">
                  <h3 className="text-xl font-bold text-white mb-2">AI Recommendations</h3>
                  <button onClick={handleSuggestShows} disabled={isGenerating.suggestions || (scoredList.length === 0 && watchlist.length === 0)} className="w-full flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                    {isGenerating.suggestions ? 'Thinking...' : <> <Sparkles size={16}/> Suggest Shows For Me </>}
                  </button>
                  <div className="mt-4 space-y-3">
                    {aiSuggestions.map(show => (
                      <div key={show.id} className="bg-gray-700/80 p-3 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="cursor-pointer flex-grow" onClick={() => handleShowClick(show)}>
                              <h4 className="font-bold text-white">{show.title} ({show.year})</h4>
                              <p className="text-sm text-gray-400 mt-1 italic">"{show.reason}"</p>
                          </div>
                          <div className="flex flex-col gap-1 ml-2">
                            <button onClick={(e) => { e.stopPropagation(); addToList(show, 'scoredList'); }} className="p-2 rounded-full bg-gray-600 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-colors" title="Add to Scored List"><Star size={16} /></button>
                            <button onClick={(e) => { e.stopPropagation(); addToList(show, 'watchlist'); }} className="p-2 rounded-full bg-gray-600 hover:bg-green-500/20 text-green-400 hover:text-green-300 transition-colors" title="Add to Watchlist"><Plus size={16} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default App;
