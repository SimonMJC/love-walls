"use client";

import React from "react"

import { useState, useEffect, useMemo, useRef } from "react";
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
  expiresAt?: Timestamp;
}

type AvoidRect = { left: number; right: number; top: number; bottom: number } // viewport % 기준
type BubblePos = {
  x: number
  y: number
  size: "sm" | "md" | "lg"
  vx?: number
  vy?: number
}

const DEFAULT_AVOID_RECT: AvoidRect = {
  // 폼이 보통 중앙에 있으니 기본값으로 대략 회피 (측정 전 fallback)
  left: 28,
  right: 72,
  top: 30,
  bottom: 70,
}

const isInsideRect = (x: number, y: number, rect: AvoidRect) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const sizeRadiusPct: Record<BubblePos["size"], number> = {
  // “겹침 방지”용 대략적인 반지름(%) — 너무 큰 버블 방지 + 겹침 최소화
  sm: 6,
  md: 7.5,
  lg: 9,
}

const dist2 = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  aspect: number // vh/vw (dy를 vw 스케일로 보정)
) => {
  const dx = ax - bx
  const dy = (ay - by) * aspect
  return dx * dx + dy * dy
}

const sizeByTextLength = (len: number): BubblePos["size"] => {
  // 텍스트가 길수록 크게. (하지만 "너무 큰" lg는 조건을 빡세게)
  if (len <= 18) return "sm"
  if (len <= 45) return "md"
  return "lg"
}

// 하트 구름 위치 생성 함수 (폼 영역 + 기존 하트 구름 영역 제외)
const generateBubblePositions = (
  count: number,
  avoidRect: AvoidRect,
  existing: BubblePos[] = [],
  sizesForNew: BubblePos["size"][] = []
) => {
  const positions: BubblePos[] = []

  const centerX = (avoidRect.left + avoidRect.right) / 2
  const centerY = (avoidRect.top + avoidRect.bottom) / 2

  const aspect = (typeof window !== "undefined" && window.innerWidth)
    ? (window.innerHeight / window.innerWidth)
    : 1

  const isOverlapping = (x: number, y: number, size: BubblePos["size"]) => {
    const r = sizeRadiusPct[size]
    const minFactor = 0.92 // 살짝만 여유를 줘서 “최대한” 안 겹치게

    for (const p of [...existing, ...positions]) {
      const rr = (r + sizeRadiusPct[p.size]) * minFactor
      if (dist2(x, y, p.x, p.y, aspect) < rr * rr) return true
    }
    return false
  }

  for (let i = 0; i < count; i++) {
    const size = sizesForNew[i] ?? "md"
    const r = sizeRadiusPct[size]

    let x = 0
    let y = 0
    let attempts = 0
    const maxAttempts = 220

    do {
      x = Math.random() * 100
      y = Math.random() * 100
      attempts++
    } while (
      (isInsideRect(x, y, avoidRect) || isOverlapping(x, y, size)) &&
      attempts < maxAttempts
    )

    // 화면 경계 내로 제한 (반지름만큼 여유)
    x = clamp(x, 2 + r, 93 - r)
    y = clamp(y, 5 + r, 85 - r)

    // 화면 내에서 천천히 “자유 이동”할 속도 (vw/vh 기준)
    const dirX = Math.random() < 0.5 ? -1 : 1
    const dirY = Math.random() < 0.5 ? -1 : 1
    const speed = 0.6 + Math.random() * 0.8 // 0.6~1.4 (vw/s, vh/s)

    positions.push({
      x,
      y,
      size,
      vx: dirX * speed,
      vy: dirY * speed,
    })
  }

  return positions
}

const sizeConfig = {
  // 기존보다 전체적으로 작게 (너무 큰 버블 방지)
  sm: { width: 88, height: 78, fontSize: "text-[10px]" },
  md: { width: 112, height: 100, fontSize: "text-[11px]" },
  lg: { width: 132, height: 118, fontSize: "text-xs" },
};

const bubbleScaleByTextLength = (len: number) => {
  // 텍스트가 길어질수록 하트를 "조금" 키워서 자연스럽게 수용 (상한 있음)
  if (len >= 75) return 1.16
  if (len >= 60) return 1.12
  if (len >= 48) return 1.06
  return 1
}

const messageTextClassByLength = (len: number, size: BubblePos["size"]) => {
  // 기본은 sizeConfig의 fontSize를 따르고, 너무 길면 단계적으로 축소
  // (line-clamp-3로 줄 수 제한 + 글자 크기 축소로 영역 밖으로 튀는 현상 완화)
  if (size === "sm") {
    if (len > 40) return "text-[8px] leading-tight"
    if (len > 28) return "text-[9px] leading-tight"
    return "leading-snug"
  }
  if (size === "md") {
    if (len > 60) return "text-[9px] leading-tight"
    if (len > 42) return "text-[10px] leading-tight"
    return "leading-snug"
  }
  // lg
  if (len > 70) return "text-[9px] leading-tight"
  if (len > 55) return "text-[10px] leading-tight"
  return "leading-snug"
}

function HeartBubble({ msg, pos, index }: { msg: Message; pos: { x: number; y: number; size: "sm" | "md" | "lg"; vx?: number; vy?: number }; index: number }) {
  const config = sizeConfig[pos.size];
  const delay = index * 0.6;
  const msgLen = msg.message?.length ?? 0
  const messageTextClass = messageTextClassByLength(msgLen, pos.size)
  const bubbleScale = bubbleScaleByTextLength(msgLen)
  const bubbleWidth = Math.round(config.width * bubbleScale)
  const bubbleHeight = Math.round(config.height * bubbleScale)
  const useMarquee = msgLen > 10
  // 조금 더 천천히 (대략 8~18초)
  const marqueeDuration = Math.max(8, Math.min(18, msgLen * 0.35)) // 8~18s
  
  return (
    <div className="absolute left-0 top-0" style={{ transform: `translate(${pos.x}vw, ${pos.y}vh)` }}>
      <div
        style={{
          // Enter는 한 번만 실행하고 유지
          animationName: "bubbleEnter",
          animationDuration: "600ms",
          animationTimingFunction: "ease-out",
          animationIterationCount: "1",
          animationFillMode: "both",
          animationDelay: `${delay * 0.08}s`,
        } as React.CSSProperties}
      >
        <div
          style={{
            animation: `gentleFloat 7s ease-in-out infinite, pulseSoft 4s ease-in-out infinite`,
            animationDelay: `${delay * 0.3}s`,
          }}
        >
          <div className="relative" style={{ width: bubbleWidth, height: bubbleHeight }}>
            <svg
              width={bubbleWidth}
              height={bubbleHeight}
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
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center text-center px-4",
                config.fontSize
              )}
              style={{ paddingTop: "18%", paddingBottom: "12%" }}
            >
              {msg.recipient && (
                <span className="text-[#9B7B8A] text-[8px] mb-0.5 truncate max-w-[80%] opacity-80">
                  To. {msg.recipient}
                </span>
              )}
              {useMarquee ? (
                <div className="w-full marqueeMask">
                  <span
                    className={cn("text-[#6B5A63] font-medium marqueeText", messageTextClass)}
                    style={
                      {
                        "--marquee-duration": `${marqueeDuration}s`,
                      } as React.CSSProperties
                    }
                  >
                    {msg.message}
                  </span>
                </div>
              ) : (
                <span className={cn("text-[#6B5A63] font-medium", messageTextClass)}>
                  {msg.message}
                </span>
              )}
              {msg.nickname && (
                <span className="text-[#A8909A] text-[8px] mt-0.5 opacity-70">- {msg.nickname}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoveWhisperWall() {
  const [messages, setMessages] = useState<Message[]>([]);
  const formRef = useRef<HTMLDivElement | null>(null)
  const [avoidRect, setAvoidRect] = useState<AvoidRect>(DEFAULT_AVOID_RECT)
  const avoidRectRef = useRef<AvoidRect>(DEFAULT_AVOID_RECT)
  const bubblePosByIdRef = useRef<Map<string, BubblePos>>(new Map())
  const [animTick, setAnimTick] = useState(0)
  const [nickname, setNickname] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxLength = 80;
  const charCount = message.length;

  // 폼의 실제 위치를 측정해서 "하트 구름 생성 금지 영역"으로 설정
  useEffect(() => {
    const el = formRef.current
    if (!el) return

    const compute = () => {
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth || 1
      const vh = window.innerHeight || 1

      // 약간의 여유(패딩)까지 금지 영역으로 잡아서, 드리프트로도 안 겹치게 함
      const padX = 24
      const padY = 24

      const left = ((rect.left - padX) / vw) * 100
      const right = ((rect.right + padX) / vw) * 100
      const top = ((rect.top - padY) / vh) * 100
      const bottom = ((rect.bottom + padY) / vh) * 100

      setAvoidRect({
        left: clamp(left, 0, 100),
        right: clamp(right, 0, 100),
        top: clamp(top, 0, 100),
        bottom: clamp(bottom, 0, 100),
      })
    }

    compute()
    window.addEventListener("resize", compute)

    return () => window.removeEventListener("resize", compute)
  }, [])

  useEffect(() => {
    avoidRectRef.current = avoidRect
  }, [avoidRect])

  // Firestore에서 실시간으로 메시지 불러오기 (만료되지 않은 메시지만)
  useEffect(() => {
    const messagesRef = collection(db, "messages");
    const now = Timestamp.now();
    
    // 만료되지 않은 메시지만 가져오기 (orderBy 없이 먼저 가져온 후 클라이언트에서 필터링)
    const q = query(
      messagesRef,
      orderBy("createdAt", "desc"), // 최신순으로 정렬
      limit(100) // 충분히 많이 가져온 후 필터링 및 랜덤 선택
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMessages: Message[] = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
          } as Message;
        })
        .filter((msg) => {
          // expiresAt이 없거나 아직 만료되지 않은 메시지만 포함
          if (!msg.createdAt) return false; // createdAt이 없으면 제외
          
          // expiresAt이 없으면 표시 (기존 메시지 호환성)
          if (!msg.expiresAt) return true;
          
          // expiresAt이 현재 시간보다 미래면 표시
          return msg.expiresAt.toMillis() > now.toMillis();
        });
      
      // 새 메시지가 들어오면 기존 사용자도 새로고침 없이 "항상" 보이게 하기 위해
      // 최신 N개는 고정으로 포함 + 나머지는 랜덤으로 채움
      const PINNED_COUNT = 3;
      const pinned = allMessages.slice(0, PINNED_COUNT);

      const pinnedIds = new Set(pinned.map((m) => m.id));
      const pool = allMessages.filter((m) => !pinnedIds.has(m.id));
      const shuffledPool = [...pool].sort(() => Math.random() - 0.5);

      const selectedMessages = [
        ...pinned,
        ...shuffledPool.slice(0, Math.max(0, 20 - pinned.length)),
      ].slice(0, 20);
      
      console.log(`[Firestore] 총 ${allMessages.length}개 메시지 중 ${selectedMessages.length}개 선택됨`);
      setMessages(selectedMessages);
    }, (error) => {
      console.error("[Firestore] 메시지 불러오기 실패:", error);
      console.error("[Firestore] 에러 코드:", error.code);
      console.error("[Firestore] 에러 메시지:", error.message);
    });

    return () => unsubscribe();
  }, []);

  // 표시할 메시지와 위치 매핑 (메시지마다 랜덤 위치 할당)
  const displayedMessages = useMemo(() => {
    const slice = messages.slice(0, 20)

    // 기존 위치는 유지 + 새 메시지만 새 위치 부여 (깜빡임/점프 최소화)
    const existing = bubblePosByIdRef.current
    const nextMap = new Map<string, BubblePos>()

    const newOnes: string[] = []
    for (const m of slice) {
      const prev = existing.get(m.id)
      if (prev) nextMap.set(m.id, prev)
      else newOnes.push(m.id)
    }

    if (newOnes.length) {
      const sizesForNew = newOnes.map((id) => {
        const m = slice.find((x) => x.id === id)
        return sizeByTextLength((m?.message ?? "").length)
      })

      const generated = generateBubblePositions(
        newOnes.length,
        avoidRect,
        Array.from(nextMap.values()),
        sizesForNew
      )
      newOnes.forEach((id, i) => nextMap.set(id, generated[i]))
    }

    bubblePosByIdRef.current = nextMap

    return slice.map((msg, index) => ({
      message: msg,
      position: nextMap.get(msg.id)!,
      index,
    }))
  }, [messages, avoidRect, animTick]);

  // 하트 구름들이 화면 안에서 "자유롭게" 천천히 움직이도록 requestAnimationFrame 루프
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let tickCounter = 0

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) // 너무 큰 dt 클램프
      last = now

      const vw = window.innerWidth || 1
      const vh = window.innerHeight || 1
      const aspect = vh / vw
      const rect = avoidRectRef.current

      const map = bubblePosByIdRef.current
      const entries = Array.from(map.entries())

      // 1) 위치 업데이트 + 벽 반사 + 폼 영역 회피
      for (const [, p] of entries) {
        const r = sizeRadiusPct[p.size]
        const rY = r / aspect

        // 약간의 랜덤 워블로 자연스러움
        const wobble = 0.15
        p.vx = clamp((p.vx ?? 0) + (Math.random() - 0.5) * wobble * dt, -1.4, 1.4)
        p.vy = clamp((p.vy ?? 0) + (Math.random() - 0.5) * wobble * dt, -1.0, 1.0)

        let nx = p.x + (p.vx ?? 0) * dt
        let ny = p.y + (p.vy ?? 0) * dt

        // 경계 반사 (viewport % 기준)
        const minX = 1 + r
        const maxX = 99 - r
        const minY = 6 + rY
        const maxY = 94 - rY

        if (nx < minX) { nx = minX; p.vx = Math.abs(p.vx ?? 0) }
        if (nx > maxX) { nx = maxX; p.vx = -Math.abs(p.vx ?? 0) }
        if (ny < minY) { ny = minY; p.vy = Math.abs(p.vy ?? 0) }
        if (ny > maxY) { ny = maxY; p.vy = -Math.abs(p.vy ?? 0) }

        // 폼 영역 침범 방지: 들어가려 하면 밀어내고 반사
        if (isInsideRect(nx, ny, rect)) {
          // 가장 가까운 변으로 밀어내기
          const dl = Math.abs(nx - rect.left)
          const dr = Math.abs(rect.right - nx)
          const dtp = Math.abs(ny - rect.top)
          const db = Math.abs(rect.bottom - ny)
          const m = Math.min(dl, dr, dtp, db)

          if (m === dl) { nx = rect.left - r; p.vx = -Math.abs(p.vx ?? 0) }
          else if (m === dr) { nx = rect.right + r; p.vx = Math.abs(p.vx ?? 0) }
          else if (m === dtp) { ny = rect.top - rY; p.vy = -Math.abs(p.vy ?? 0) }
          else { ny = rect.bottom + rY; p.vy = Math.abs(p.vy ?? 0) }
        }

        p.x = nx
        p.y = ny
      }

      // 2) 간단한 겹침 완화(서로 너무 가까우면 속도를 살짝 밀어냄)
      const ps = entries.map(([, p]) => p)
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i]
          const b = ps[j]
          const rr = (sizeRadiusPct[a.size] + sizeRadiusPct[b.size]) * 0.92
          const d2 = dist2(a.x, a.y, b.x, b.y, aspect)
          if (d2 < rr * rr) {
            const dx = a.x - b.x
            const dy = (a.y - b.y) * aspect
            const d = Math.max(0.001, Math.sqrt(d2))
            const ux = dx / d
            const uy = dy / d
            const push = (rr - d) * 0.8

            a.vx = clamp((a.vx ?? 0) + ux * push * dt, -1.6, 1.6)
            a.vy = clamp((a.vy ?? 0) + (uy / aspect) * push * dt, -1.2, 1.2)
            b.vx = clamp((b.vx ?? 0) - ux * push * dt, -1.6, 1.6)
            b.vy = clamp((b.vy ?? 0) - (uy / aspect) * push * dt, -1.2, 1.2)
          }
        }
      }

      // 렌더는 60fps 대신 약간만(대략 30fps) 갱신해서 부담 줄임
      tickCounter++
      if (tickCounter % 2 === 0) setAnimTick((t) => t + 1)

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    
    try {
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000); // 24시간 후

      const trimmedMessage = message.trim()
      const trimmedNickname = nickname.trim()
      const trimmedRecipient = recipient.trim()

      // Firestore는 undefined 값을 저장할 수 없어 저장이 실패할 수 있음 → 빈 값은 필드를 아예 제외
      const payload: Record<string, any> = {
        message: trimmedMessage,
        createdAt: now,
        expiresAt,
      }
      if (trimmedNickname) payload.nickname = trimmedNickname
      if (trimmedRecipient) payload.recipient = trimmedRecipient

      await addDoc(collection(db, "messages"), payload);

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
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-3 pb-4 md:pt-4 md:pb-5">
          <div className="grid grid-cols-3 items-center">
            {/* Left spacer (keeps center perfectly centered) */}
            <div />

            {/* Centered title/subtitle */}
            <div className="flex flex-col items-center text-center leading-tight">
              <h1 className="text-base md:text-lg font-semibold text-gray-700">
                Love Walls
              </h1>
              <p className="text-[10px] md:text-xs text-gray-500">
                사랑의 한 마디를 남겨주세요
              </p>
            </div>

            {/* Right-aligned heart icon */}
            <div className="flex items-center justify-end">
              <Heart className="w-5 h-5 text-[#FF9FBF] fill-[#FF9FBF]" />
            </div>
          </div>
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
        {displayedMessages.map(({ message: msg, position: pos, index: i }) => (
          <HeartBubble key={msg.id} msg={msg} pos={pos} index={i} />
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
          <span className="text-gray-600 text-sm">당신의 사랑이 전달되었어요 😘</span>
        </div>
      </div>

      {/* Form Card */}
      <div className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none">
        <div
          ref={formRef}
          className="bg-white/90 backdrop-blur-lg border border-[#FFD6E4] rounded-3xl shadow-2xl w-[280px] sm:w-[320px] md:w-[400px] overflow-hidden pointer-events-auto"
          style={{ boxShadow: "0 25px 60px -12px rgba(255, 159, 191, 0.35), 0 12px 30px -8px rgba(0, 0, 0, 0.1)" }}
        >
          <div className="flex items-center justify-center gap-2 px-4 py-3 sm:px-5 sm:py-4 border-b border-[#FFE4EC] bg-gradient-to-r from-[#FFF8FA] to-[#FFF0F5]">
            <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF9FBF] fill-[#FF9FBF]" />
            <span className="font-semibold text-gray-700 text-sm sm:text-base">사랑의 한 마디를 보내보아요.</span>
          </div>
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3 sm:space-y-4">
            <div>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임"
                className="w-full px-3 py-2 sm:px-4 sm:py-2.5 bg-[#FFF8FA] border border-[#FFE4EC] rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#FFB8D0] focus:ring-2 focus:ring-[#FFE4EC] transition-all text-xs sm:text-sm"
              />
              <span className="text-[9px] sm:text-[10px] text-gray-400 ml-2">닉네임 (선택)</span>
            </div>
            <div>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="예: 친구에게, 우리 강아지에게..."
                className="w-full px-3 py-2 sm:px-4 sm:py-2.5 bg-[#FFF8FA] border border-[#FFE4EC] rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#FFB8D0] focus:ring-2 focus:ring-[#FFE4EC] transition-all text-xs sm:text-sm"
              />
              <span className="text-[9px] sm:text-[10px] text-gray-400 ml-2">누구에게 (선택)</span>
            </div>
            <div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
                placeholder="사랑을 담은 한 마디를 남겨주세요❤️"
                rows={2}
                className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-[#FFF8FA] border border-[#FFE4EC] rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#FFB8D0] focus:ring-2 focus:ring-[#FFE4EC] transition-all text-xs sm:text-sm resize-none"
              />
              <div className="flex justify-between items-center mt-1 px-1">
                <span className="text-[9px] sm:text-[10px] text-gray-400">메시지 (필수)</span>
                <span className={cn("text-[10px] sm:text-xs", charCount >= maxLength ? "text-red-400" : "text-gray-400")}>
                  {charCount}/{maxLength}
                </span>
              </div>
            </div>
            <button
              type="submit"
              disabled={!message.trim() || isSubmitting}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-full font-medium transition-all duration-300 text-xs sm:text-sm",
                message.trim() && !isSubmitting
                  ? "bg-gradient-to-r from-[#FFB8D0] to-[#FF9FBF] hover:from-[#FFA8C8] hover:to-[#FF8FB0] text-white shadow-lg hover:shadow-xl"
                  : "bg-[#FFE4EC] text-gray-400 cursor-not-allowed"
              )}
            >
              <Send className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>{isSubmitting ? "전송 중..." : "전송하기"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
