import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, collection, query, onSnapshot, addDoc, Timestamp,
    orderBy, serverTimestamp, updateDoc, doc, deleteDoc, setLogLevel
} from 'firebase/firestore';
import {
    ListChecks, PlusCircle, User, Loader2, BookOpen, Clock, CheckCircle
} from 'lucide-react';

// --- GLOBAL FIREBASE CONFIGURATION ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase services
let app;
let db;
let auth;

if (firebaseConfig) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setLogLevel('error'); 
}

// --- CONSTANTS ---
const TASK_COLLECTION = `artifacts/${appId}/public/data/study_tasks`;

const STATUS_MAP = {
    'todo': { label: 'To Do', color: 'bg-red-500', next: 'in_progress', nextLabel: 'Start Task' },
    'in_progress': { label: 'In Progress', color: 'bg-yellow-500', next: 'done', nextLabel: 'Complete Task' },
    'done': { label: 'Done', color: 'bg-green-500', next: 'todo', nextLabel: 'Reopen Task' }
};

// --- HELPER FUNCTION: Get Collection Reference ---
const getCollectionRef = (database) => {
    if (!database) return null;
    return collection(database, TASK_COLLECTION);
};


// --- TASK CARD COMPONENT ---
const TaskCard = ({ task, db, userId }) => {
    const statusInfo = STATUS_MAP[task.status] || STATUS_MAP.todo;

    const changeStatus = async () => {
        if (!db) return;
        const taskRef = doc(db, TASK_COLLECTION, task.id);
        const newStatus = statusInfo.next;
        
        try {
            await updateDoc(taskRef, {
                status: newStatus,
                // Automatically assign task to user when they change the status from To Do
                assignedTo: (newStatus === 'in_progress' && task.status === 'todo') ? userId : task.assignedTo
            });
        } catch (error) {
            console.error("Error updating task status:", error);
        }
    };

    const deleteTask = async (e) => {
        e.stopPropagation(); // Prevent status change when deleting
        if (!db) return;
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        
        const taskRef = doc(db, TASK_COLLECTION, task.id);
        try {
            await deleteDoc(taskRef);
        } catch (error) {
            console.error("Error deleting task:", error);
        }
    };

    const assignedIndicator = task.assignedTo 
        ? (task.assignedTo === userId ? 'You' : task.assignedTo.substring(0, 8)) 
        : 'Unassigned';

    return (
        <div className="bg-white p-4 rounded-xl shadow-md transition duration-200 hover:shadow-lg flex flex-col justify-between h-full">
            <div>
                <div className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block text-white ${statusInfo.color}`}>
                    {statusInfo.label}
                </div>
                <h3 className="text-lg font-bold text-gray-800 mt-2 line-clamp-2">{task.title}</h3>
                <p className="text-sm text-gray-600 mt-1 mb-3 line-clamp-3">{task.description}</p>
            </div>

            <div className="mt-auto border-t pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center">
                        <User className="w-3 h-3 mr-1" /> Assigned: {assignedIndicator}
                    </span>
                    <button 
                        onClick={deleteTask}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Delete Task"
                    >
                        &times;
                    </button>
                </div>
                <button
                    onClick={changeStatus}
                    className={`w-full flex items-center justify-center text-xs font-medium py-2 px-3 rounded-lg text-white transition-colors duration-200 
                        ${statusInfo.next === 'done' ? 'bg-green-600 hover:bg-green-700' : 
                          statusInfo.next === 'in_progress' ? 'bg-indigo-600 hover:bg-indigo-700' : 
                          'bg-gray-500 hover:bg-gray-600'}`
                    }
                >
                    {statusInfo.next === 'done' && <CheckCircle className="w-4 h-4 mr-1" />}
                    {statusInfo.nextLabel}
                </button>
            </div>
        </div>
    );
};

// --- TASK ADDITION MODAL ---
const TaskForm = ({ db, userId, onTaskAdded }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const collectionRef = getCollectionRef(db);
        if (!collectionRef || !title) return;

        setIsLoading(true);

        try {
            await addDoc(collectionRef, {
                title,
                description,
                status: 'todo', // Default status
                createdAt: serverTimestamp(),
                assignedTo: null, // Initially unassigned
                createdBy: userId,
            });
            setTitle('');
            setDescription('');
            onTaskAdded();
        } catch (error) {
            console.error("Error adding task: ", error);
            alert("Failed to add task. Check console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">Task Title (e.g., Chapter 5 Quiz)</label>
                <input
                    type="text"
                    id="title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                />
            </div>
            <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">Details (e.g., pages 120-150)</label>
                <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows="3"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                />
            </div>
            <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition duration-150"
            >
                {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <PlusCircle className="w-5 h-5 mr-2" />}
                Add Task to Board
            </button>
        </form>
    );
};


// --- MAIN APPLICATION COMPONENT ---
const App = () => {
    const [tasks, setTasks] = useState([]);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);
    const [showAddTaskForm, setShowAddTaskForm] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Initializing Firebase...');

    // 1. Authentication and Initialization Effect
    useEffect(() => {
        if (!firebaseConfig) {
            setLoadingMessage('Firebase configuration is missing.');
            return;
        }

        const initializeAuth = async () => {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Firebase Auth Error:", error);
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
                setLoadingMessage('Fetching study tasks...');
            } else {
                setUserId(null);
                setIsAuthReady(true);
                setLoadingMessage('Awaiting authentication...');
            }
        });

        initializeAuth();
        return () => unsubscribe();
    }, []);

    // 2. Data Fetching Effect (Real-time listener)
    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;

        const q = query(collection(db, TASK_COLLECTION), orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tasksData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTasks(tasksData);
            setLoadingMessage(`Loaded ${tasksData.length} tasks.`);
        }, (error) => {
            console.error("Firestore real-time error:", error);
            setLoadingMessage('Failed to connect to real-time feed.');
        });

        return () => unsubscribe();
    }, [isAuthReady, userId]); 

    // 3. Group Tasks by Status (Kanban Columns)
    const groupedTasks = useMemo(() => {
        const groups = {
            todo: [],
            in_progress: [],
            done: []
        };
        tasks.forEach(task => {
            groups[task.status] = groups[task.status] || [];
            groups[task.status].push(task);
        });
        return groups;
    }, [tasks]);

    // --- Column Renderer ---
    const renderColumn = (statusKey) => {
        const info = STATUS_MAP[statusKey];
        const taskList = groupedTasks[statusKey];
        
        return (
            <div key={statusKey} className="flex flex-col w-full md:w-1/3 p-2">
                <h2 className="text-xl font-bold mb-4 flex items-center text-gray-800">
                    <span className={`w-3 h-3 rounded-full mr-2 ${info.color}`}></span>
                    {info.label} ({taskList.length})
                </h2>
                <div className="flex-grow space-y-4">
                    {taskList.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                            {statusKey === 'done' ? 'Great work! No completed tasks yet.' : 'Nothing here yet! Add a task.'}
                        </div>
                    ) : (
                        taskList.map(task => (
                            <TaskCard key={task.id} task={task} db={db} userId={userId} />
                        ))
                    )}
                </div>
            </div>
        );
    };


    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            {/* Header */}
            <header className="max-w-7xl mx-auto mb-8">
                <div className="flex items-center justify-between border-b pb-4">
                    <h1 className="text-3xl font-extrabold text-gray-900 flex items-center">
                        <BookOpen className="w-7 h-7 mr-3 text-indigo-500" />
                        StudyFlow: Collaborative Task Board
                    </h1>
                    <button
                        onClick={() => setShowAddTaskForm(true)}
                        className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 transition duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        <PlusCircle className="w-5 h-5 mr-2" />
                        Add New Task
                    </button>
                </div>
                <p className="mt-2 text-sm text-gray-600 flex items-center">
                    <Clock className="w-4 h-4 mr-1.5" />
                    All study group members see real-time updates. Click on a task to advance its status!
                </p>
                <div className="text-xs text-right text-gray-400 mt-1">
                    Your User ID (Group Identifier): {userId || 'Authenticating...'}
                </div>
            </header>

            {/* Main Content Feed (Kanban Board) */}
            <main className="max-w-7xl mx-auto">
                {!isAuthReady || tasks.length === 0 && loadingMessage.includes('Fetching') ? (
                    <div className="text-center text-gray-500 p-8 flex flex-col items-center"><Loader2 className="w-8 h-8 animate-spin mb-4" />{loadingMessage}</div>
                ) : (
                    <div className="flex flex-col md:flex-row md:space-x-4">
                        {renderColumn('todo')}
                        {renderColumn('in_progress')}
                        {renderColumn('done')}
                    </div>
                )}
            </main>

            {/* Add Task Modal (Overlay) */}
            {showAddTaskForm && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex justify-between items-center border-b pb-3 mb-4">
                            <h3 className="text-xl font-semibold text-gray-900">Add New Study Task</h3>
                            <button 
                                onClick={() => setShowAddTaskForm(false)} 
                                className="text-gray-400 hover:text-gray-600"
                            >
                                &times;
                            </button>
                        </div>
                        <TaskForm 
                            db={db} 
                            userId={userId} 
                            onTaskAdded={() => setShowAddTaskForm(false)} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;