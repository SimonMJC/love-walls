"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExpiredMessages = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
// 24시간이 지난 메시지 자동 삭제 스케줄러
// 매 시간마다 실행되어 만료된 메시지를 삭제합니다
exports.deleteExpiredMessages = (0, scheduler_1.onSchedule)("every 1 hours", async () => {
    const now = admin.firestore.Timestamp.now();
    try {
        // expiresAt이 현재 시간보다 이전인 문서들을 찾아서 삭제
        const expiredMessages = await db
            .collection("messages")
            .where("expiresAt", "<=", now)
            .get();
        if (expiredMessages.empty) {
            console.log("삭제할 만료된 메시지가 없습니다.");
            return;
        }
        const batch = db.batch();
        expiredMessages.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`${expiredMessages.size}개의 만료된 메시지가 삭제되었습니다.`);
        return;
    }
    catch (error) {
        console.error("만료된 메시지 삭제 중 오류 발생:", error);
        throw error;
    }
});
//# sourceMappingURL=index.js.map