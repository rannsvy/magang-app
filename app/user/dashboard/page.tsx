"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { TechnicianHeader } from "@/components/technician-header"
import { Pagination } from "@/components/pagination"
import { Star } from "lucide-react"

interface Job {
  id: string
  name: string
  location: string
  status: "not-started" | "in-progress" | "completed"
  progress?: number
  assignedTechnicians: { name: string; isLeader: boolean }[]
  jobId: string
}

// Mock data for demonstration
const mockJobs: Job[] = [
  {
    id: "1",
    name: "Pemasangan CCTV RW 06",
    location: "Jl. Merdeka No. 123",
    status: "not-started",
    assignedTechnicians: [
      { name: "Edo", isLeader: true },
      { name: "Ahmad", isLeader: false },
      { name: "Fahmi", isLeader: false },
    ],
    jobId: "JOB-PEMASANGAN-CCTV-01",
  },
  {
    id: "2",
    name: "Maintenance Server Kantor",
    location: "Gedung Perkantoran Lt. 5",
    status: "in-progress",
    progress: 30,
    assignedTechnicians: [
      { name: "Ahmad", isLeader: true },
      { name: "Budi", isLeader: false },
    ],
    jobId: "JOB-MAINTENANCE-SERVER-01",
  },
  {
    id: "3",
    name: "Instalasi Jaringan WiFi",
    location: "Komplek Perumahan Blok A",
    status: "completed",
    assignedTechnicians: [
      { name: "Fahmi", isLeader: true },
      { name: "Edo", isLeader: false },
      { name: "Ahmad", isLeader: false },
    ],
    jobId: "JOB-INSTALASI-JARINGAN-WIFI-01",
  },
  {
    id: "4",
    name: "Perbaikan Router Mikrotik",
    location: "Warnet Cyber Net",
    status: "in-progress",
    progress: 75,
    assignedTechnicians: [
      { name: "Ahmad", isLeader: true },
      { name: "Candra", isLeader: false },
    ],
    jobId: "JOB-PERBAIKAN-ROUTER-MIKROTIK-01",
  },
  {
    id: "5",
    name: "Setup Access Point",
    location: "Cafe Corner Street",
    status: "not-started",
    assignedTechnicians: [
      { name: "Budi", isLeader: true },
      { name: "Fahmi", isLeader: false },
    ],
    jobId: "JOB-SETUP-ACCESS-POINT-01",
  },
  {
    id: "6",
    name: "Konfigurasi Firewall",
    location: "PT. Teknologi Maju",
    status: "completed",
    assignedTechnicians: [
      { name: "Edo", isLeader: true },
      { name: "Ahmad", isLeader: false },
    ],
    jobId: "JOB-KONFIGURASI-FIREWALL-01",
  },
  {
    id: "7",
    name: "Instalasi CCTV Toko",
    location: "Toko Elektronik Jaya",
    status: "not-started",
    assignedTechnicians: [
      { name: "Ahmad", isLeader: true },
      { name: "Candra", isLeader: false },
      { name: "Budi", isLeader: false },
    ],
    jobId: "JOB-INSTALASI-CCTV-TOKO-01",
  },
  {
    id: "8",
    name: "Maintenance UPS Server",
    location: "Data Center Regional",
    status: "in-progress",
    progress: 50,
    assignedTechnicians: [
      { name: "Fahmi", isLeader: true },
      { name: "Edo", isLeader: false },
    ],
    jobId: "JOB-MAINTENANCE-UPS-SERVER-01",
  },
]

export default function TechnicianDashboard() {
  const [currentPage, setCurrentPage] = useState(1)
  const router = useRouter()
  const jobsPerPage = 4

  const totalPages = Math.ceil(mockJobs.length / jobsPerPage)
  const startIndex = (currentPage - 1) * jobsPerPage
  const currentJobs = mockJobs.slice(startIndex, startIndex + jobsPerPage)

  const getStatusDisplay = (job: Job) => {
    switch (job.status) {
      case "not-started":
        return { text: "Belum Dimulai", color: "bg-gray-100 text-gray-700" }
      case "in-progress":
        return { text: `${job.progress}%`, color: "bg-yellow-100 text-yellow-700" }
      case "completed":
        return { text: "Selesai", color: "bg-green-100 text-green-700" }
    }
  }

  const getCardBackground = (status: Job["status"]) => {
    switch (status) {
      case "not-started":
        return "bg-gray-50 border-gray-200"
      case "in-progress":
        return "bg-yellow-50 border-yellow-200"
      case "completed":
        return "bg-green-50 border-green-200"
    }
  }

  const handleJobClick = (jobId: string) => {
    router.push(`/user/upload_foto?job=${jobId}`)
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader title="Sistem Laporan Teknisi" />

      {/* Main Content */}
      <main className="p-4">
        <div className="max-w-md mx-auto">
          <div className="space-y-1 mb-6">
            {currentJobs.map((job) => {
              const statusDisplay = getStatusDisplay(job)
              const cardBackground = getCardBackground(job.status)

              return (
                <Card
                  key={job.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${cardBackground}`}
                  onClick={() => handleJobClick(job.id)}
                >
                  <CardContent className="px-2 py-1">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-1 pr-2">
                        <h3 className="font-bold text-sm text-gray-900 mb-0.5 leading-tight">{job.name}</h3>
                        <p className="text-xs text-gray-600 leading-tight mb-0.5">{job.location}</p>

                        <div className="text-xs text-gray-600 mb-0.5">
                          <span className="font-medium">Ditugaskan bersama:</span>
                          <div className="mt-0.5">
                            {job.assignedTechnicians.map((tech, index) => (
                              <div key={index} className="flex items-center gap-1">
                                <span>
                                  {index + 1}. {tech.name}
                                </span>
                                {tech.isLeader && <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusDisplay.color}`}
                        >
                          {statusDisplay.text}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono leading-none">{job.jobId}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
            />
          )}
        </div>
      </main>
    </div>
  )
}
