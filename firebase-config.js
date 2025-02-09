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
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 配置 Firestore 設置
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// 啟用離線持久化
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            // 多個標籤頁同時打開時可能發生
            console.log('持久化失敗：多個標籤頁同時打開');
        } else if (err.code == 'unimplemented') {
            // 瀏覽器不支持持久化
            console.log('當前瀏覽器不支持持久化');
        }
    }); 