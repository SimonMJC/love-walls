import * as functions from "firebase-functions"
import * as admin from "firebase-admin"

admin.initializeApp()

const db = admin.firestore()

export const helloWorld = functions.https.onRequest(async (req, res) => {
  await db.collection("logs").add({
    message: "Hello from love-walls!",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  res.send("Hello from love-walls!")
})

