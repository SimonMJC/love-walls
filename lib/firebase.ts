import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app"
import { getFirestore, Firestore } from "firebase/firestore"
import { getFunctions, Functions } from "firebase/functions"

let app: FirebaseApp
let db: Firestore
let functions: Functions

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

if (!firebaseConfig.projectId) {
  console.warn(
    "[firebase] NEXT_PUBLIC_FIREBASE_PROJECT_ID 환경변수가 설정되지 않았습니다."
  )
}

if (!getApps().length) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApp()
}

db = getFirestore(app)
functions = getFunctions(app)

export { app, db, functions }

