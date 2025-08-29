"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getDailyQuote } from "@/lib/quotes"   // ⬅️ cukup ini

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  // quote harian (tanpa role)
  const quote = useMemo(() => getDailyQuote(), [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    setTimeout(() => {
      if (email && password) {
        if (email.includes("admin")) router.push("/admin/dashboard")
        else router.push("/user/dashboard")
      } else {
        setError("Email atau password salah")
      }
      setIsLoading(false)
    }, 1000)
  }

  const handleForgotPassword = () => router.push("/auth/forgot_password")

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Sistem Laporan Otomatis Teknisi
          </CardTitle>
          <CardDescription>Masuk ke akun Anda untuk melanjutkan</CardDescription>

          {/* Quote harian */}
          <div className="mt-4 rounded-md border bg-white px-4 py-3 text-sm italic text-gray-700">
            “{quote}”
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Masukkan email Anda"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Masukkan password Anda"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Masuk..." : "Login"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Lupa Password?
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
