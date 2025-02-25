import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
import { 
    getFirestore,
    initializeFirestore
} from "https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-analytics.js";

// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyBqdwiIMH2pAgQK_y5YQVmOFpsDfZ7ZHuI",
    authDomain: "encapsulation-da072.firebaseapp.com",
    projectId: "encapsulation-da072",
    storageBucket: "encapsulation-da072.firebasestorage.app",
    messagingSenderId: "41576121757",
    appId: "1:41576121757:web:4d717f0a7ee8cb29fb1b74",
    measurementId: "G-2VGDQYDDTS"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// 使用新的推薦方式初始化 Firestore
const db = getFirestore(app);

// 不再使用 enableIndexedDbPersistence，改用新的設置方式
// Firebase 會自動處理離線持久化

export { db }; 