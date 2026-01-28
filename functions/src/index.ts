import { onSchedule } from "firebase-functions/v2/scheduler"
import * as admin from "firebase-admin"

admin.initializeApp()

const db = admin.firestore()

// 24시간이 지난 메시지 자동 삭제 스케줄러
// 매 시간마다 실행되어 만료된 메시지를 삭제합니다
export const deleteExpiredMessages = onSchedule("every 1 hours", async () => {
    const now = admin.firestore.Timestamp.now()
    
    try {
      // expiresAt이 현재 시간보다 이전인 문서들을 찾아서 삭제
      const expiredMessages = await db
        .collection("messages")
        .where("expiresAt", "<=", now)
        .get()

      if (expiredMessages.empty) {
        console.log("삭제할 만료된 메시지가 없습니다.")
        return
      }

      const batch = db.batch()
      expiredMessages.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()
      console.log(`${expiredMessages.size}개의 만료된 메시지가 삭제되었습니다.`)
      return
    } catch (error) {
      console.error("만료된 메시지 삭제 중 오류 발생:", error)
      throw error
    }
})
