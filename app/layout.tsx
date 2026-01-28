import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Love Walls',
  description: '사랑의 한 마디를 남겨주세요❤️',
  generator: 'v0.app',
  openGraph: {
    title: 'Love Walls',
    description: '사랑의 한 마디를 남겨주세요❤️',
    images: [
      {
        url: '/heart-header.svg',
        width: 512,
        height: 512,
        alt: 'Love Walls heart',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Love Walls',
    description: '사랑의 한 마디를 남겨주세요❤️',
    images: ['/heart-header.svg'],
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
