"use client";

import React from "react"

import { useState, useEffect } from "react";
import { Heart, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot, Timestamp, limit } from "firebase/firestore";

interface Message {
  id: string;
  nickname?: string;
  recipient?: string;
  message: string;
  createdAt?: Timestamp;
}

// Pre-calculated positions for each bubble
const bubblePositions = [
  { x: 5, y: 8, size: "sm" }, { x: 22, y: 12, size: "md" }, { x: 42, y: 6, size: "lg" },
  { x: 62, y: 14, size: "sm" }, { x: 82, y: 10, size: "md" }, { x: 10, y: 28, size: "lg" },
  { x: 28, y: 32, size: "sm" }, { x: 50, y: 26, size: "md" }, { x: 70, y: 30, size: "lg" },
  { x: 88, y: 24, size: "sm" }, { x: 8, y: 48, size: "md" }, { x: 25, y: 52, size: "lg" },
  { x: 45, y: 46, size: "sm" }, { x: 65, y: 50, size: "md" }, { x: 85, y: 44, size: "lg" },
  { x: 12, y: 68, size: "sm" }, { x: 32, y: 72, size: "md" }, { x: 52, y: 66, size: "lg" },
  { x: 72, y: 70, size: "sm" }, { x: 90, y: 64, size: "md" },
] as const;

const sizeConfig = {
  sm: { width: 100, height: 90, fontSize: "text-[10px]" },
  md: { width: 130, height: 115, fontSize: "text-xs" },
  lg: { width: 160, height: 140, fontSize: "text-sm" },
};

function HeartBubble({ msg, pos, index }: { msg: Message; pos: typeof bubblePositions[number]; index: number }) {
  const config = sizeConfig[pos.size];
  const delay = index * 0.6;
  
  return (
    <div
      className="absolute"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        animation: `floatAppear 22s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
    >
      <div
        style={{
          animation: `gentleFloat 7s ease-in-out infinite, pulseSoft 4s ease-in-out infinite`,
          animationDelay: `${delay * 0.3}s`,
        }}
      >
        <svg
          width={config.width}
          height={config.height}
          viewBox="0 0 100 90"
          style={{ filter: "drop-shadow(0 4px 12px rgba(255, 159, 191, 0.4))" }}
        >
          <defs>
            <linearGradient id={`hg${msg.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFD6E8" />
              <stop offset="50%" stopColor="#FFB8D0" />
              <stop offset="100%" stopColor="#FFA0C0" />
            </linearGradient>
          </defs>
          <path
            d="M50 85 C50 85, 5 55, 5 28 C5 10, 18 2, 30 2 C40 2, 48 10, 50 18 C52 10, 60 2, 70 2 C82 2, 95 10, 95 28 C95 55, 50 85, 50 85 Z"
            fill="rgba(255, 184, 208, 0.25)"
            transform="translate(0, 1)"
          />
          <path
            d="M50 85 C50 85, 5 55, 5 28 C5 10, 18 2, 30 2 C40 2, 48 10, 50 18 C52 10, 60 2, 70 2 C82 2, 95 10, 95 28 C95 55, 50 85, 50 85 Z"
            fill={`url(#hg${msg.id})`}
          />
          <ellipse cx="32" cy="22" rx="11" ry="7" fill="rgba(255,255,255,0.5)" transform="rotate(-20,32,22)" />
          <ellipse cx="68" cy="22" rx="11" ry="7" fill="rgba(255,255,255,0.35)" transform="rotate(20,68,22)" />
        </svg>
        <div
          className={cn("absolute inset-0 flex flex-col items-center justify-center text-center px-4", config.fontSize)}
          style={{ paddingTop: "18%", paddingBottom: "12%" }}
        >
          {msg.recipient && (
            <span className="text-[#9B7B8A] text-[8px] mb-0.5 truncate max-w-[80%] opacity-80">
              To. {msg.recipient}
            </span>
          )}
          <span className="text-[#6B5A63] font-medium leading-snug line-clamp-3">{msg.message}</span>
          {msg.nickname && (
            <span className="text-[#A8909A] text-[8px] mt-0.5 opacity-70">- {msg.nickname}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoveWhisperWall() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [nickname, setNickname] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxLength = 80;
  const charCount = message.length;

  // Firestore에서 실시간으로 메시지 불러오기
  useEffect(() => {
    const messagesRef = collection(db, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(20));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData: Message[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[];
      
      // 최신 메시지가 위로 오도록 역순으로 정렬 (화면 표시용)
      setMessages(messagesData.reverse());
    }, (error) => {
      console.error("메시지 불러오기 실패:", error);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    
    try {
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000); // 24시간 후

      await addDoc(collection(db, "messages"), {
        message: message.trim(),
        nickname: nickname.trim() || undefined,
        recipient: recipient.trim() || undefined,
        createdAt: now,
        expiresAt: expiresAt,
      });

      // 폼 초기화
      setNickname("");
      setRecipient("");
      setMessage("");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      console.error("메시지 저장 실패:", error);
      alert("메시지 전송에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md border-b border-[#FFE4EC]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-[#FF9FBF] fill-[#FF9FBF]" />
            <h1 className="text-base md:text-lg font-semibold text-gray-700">
              <span className="hidden sm:inline">Love Whisper Wall</span>
              <span className="sm:hidden">사랑의 대나무숲</span>
            </h1>
          </div>
          <p className="text-xs text-gray-500 hidden md:block">
            사랑하는 모든 존재에게 보내는 한 줄 고백들
          </p>
        </div>
      </header>

      {/* Background Gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#FFF8FA] via-white to-[#FFF0F5] z-0" />
      <div
        className="fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(255, 184, 208, 0.12) 0%, transparent 60%)" }}
      />

      {/* Heart Bubbles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-10">
        {messages.slice(0, 20).map((msg, i) => (
          <HeartBubble key={msg.id} msg={msg} pos={bubblePositions[i]} index={i} />
        ))}
      </div>

      {/* Toast */}
      <div
        className={cn(
          "fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-500",
          showToast ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
        )}
      >
        <div className="bg-white/95 backdrop-blur-sm border border-[#FFD6E4] rounded-full px-6 py-3 shadow-lg flex items-center gap-2">
          <Heart className="w-4 h-4 text-[#FF9FBF] fill-[#FF9FBF]" />
          <span className="text-gray-600 text-sm">당신의 사랑이 대나무숲에 전달되었어요</span>
        </div>
      </div>

      {/* Form Card */}
      <div className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none">
        <div
          className="bg-white/90 backdrop-blur-lg border border-[#FFD6E4] rounded-3xl shadow-2xl w-[340px] md:w-[400px] overflow-hidden pointer-events-auto"
          style={{ boxShadow: "0 25px 60px -12px rgba(255, 159, 191, 0.35), 0 12px 30px -8px rgba(0, 0, 0, 0.1)" }}
        >
          <div className="flex items-center justify-center gap-2 px-5 py-4 border-b border-[#FFE4EC] bg-gradient-to-r from-[#FFF8FA] to-[#FFF0F5]">
            <Heart className="w-5 h-5 text-[#FF9FBF] fill-[#FF9FBF]" />
            <span className="font-semibold text-gray-700">사랑 한 줄 남기기</span>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="익명님"
                className="w-full px-4 py-2.5 bg-[#FFF8FA] border border-[#FFE4EC] rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#FFB8D0] focus:ring-2 focus:ring-[#FFE4EC] transition-all text-sm"
              />
              <span className="text-[10px] text-gray-400 ml-2">닉네임 (선택)</span>
            </div>
            <div>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="엄마에게, 우리 강아지에게, 너에게..."
                className="w-full px-4 py-2.5 bg-[#FFF8FA] border border-[#FFE4EC] rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#FFB8D0] focus:ring-2 focus:ring-[#FFE4EC] transition-all text-sm"
              />
              <span className="text-[10px] text-gray-400 ml-2">누구에게 (선택)</span>
            </div>
            <div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
                placeholder="사랑을 담은 한 줄을 남겨주세요..."
                rows={3}
                className="w-full px-4 py-3 bg-[#FFF8FA] border border-[#FFE4EC] rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#FFB8D0] focus:ring-2 focus:ring-[#FFE4EC] transition-all text-sm resize-none"
              />
              <div className="flex justify-between items-center mt-1 px-1">
                <span className="text-[10px] text-gray-400">메시지 (필수)</span>
                <span className={cn("text-xs", charCount >= maxLength ? "text-red-400" : "text-gray-400")}>
                  {charCount}/{maxLength}
                </span>
              </div>
            </div>
            <button
              type="submit"
              disabled={!message.trim() || isSubmitting}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium transition-all duration-300",
                message.trim() && !isSubmitting
                  ? "bg-gradient-to-r from-[#FFB8D0] to-[#FF9FBF] hover:from-[#FFA8C8] hover:to-[#FF8FB0] text-white shadow-lg hover:shadow-xl"
                  : "bg-[#FFE4EC] text-gray-400 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? "전송 중..." : "전송하기"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
