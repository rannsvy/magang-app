"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { TechnicianHeader } from "@/components/technician-header"
import { ChevronRight, ChevronDown, Folder, FileText } from "lucide-react"

interface Room {
  id: string
  name: string
  hasChildren: boolean
  uploaded: number
  required: number
  status: "pending" | "partial" | "complete"
  children?: Room[]
}

interface Floor {
  id: string
  floor_number: number
  name: string
  rooms: Room[]
  expanded: boolean
}

const mockTreeData: Floor[] = [
  {
    id: "floor-1",
    floor_number: 1,
    name: "Lantai 1",
    expanded: true,
    rooms: [
      {
        id: "room-1-1",
        name: "Lobby",
        hasChildren: false,
        uploaded: 3,
        required: 6,
        status: "partial",
      },
      {
        id: "room-1-2",
        name: "Ruang Meeting",
        hasChildren: true,
        uploaded: 8,
        required: 12,
        status: "partial",
        children: [
          {
            id: "subroom-1-2-1",
            name: "Meeting Room A",
            hasChildren: false,
            uploaded: 4,
            required: 6,
            status: "partial",
          },
          {
            id: "subroom-1-2-2",
            name: "Meeting Room B",
            hasChildren: false,
            uploaded: 4,
            required: 6,
            status: "complete",
          },
        ],
      },
      {
        id: "room-1-3",
        name: "Pantry",
        hasChildren: false,
        uploaded: 2,
        required: 2,
        status: "complete",
      },
    ],
  },
  {
    id: "floor-2",
    floor_number: 2,
    name: "Lantai 2",
    expanded: true,
    rooms: [
      {
        id: "room-2-1",
        name: "Office Area",
        hasChildren: true,
        uploaded: 5,
        required: 15,
        status: "partial",
        children: [
          {
            id: "subroom-2-1-1",
            name: "Workstation 1",
            hasChildren: false,
            uploaded: 2,
            required: 5,
            status: "partial",
          },
          {
            id: "subroom-2-1-2",
            name: "Workstation 2",
            hasChildren: false,
            uploaded: 3,
            required: 5,
            status: "partial",
          },
          {
            id: "subroom-2-1-3",
            name: "Manager Room",
            hasChildren: false,
            uploaded: 0,
            required: 5,
            status: "pending",
          },
        ],
      },
      {
        id: "room-2-2",
        name: "Storage",
        hasChildren: false,
        uploaded: 0,
        required: 3,
        status: "pending",
      },
    ],
  },
  {
    id: "floor-3",
    floor_number: 3,
    name: "Lantai 3",
    expanded: true,
    rooms: [
      {
        id: "room-3-1",
        name: "Server Room",
        hasChildren: false,
        uploaded: 6,
        required: 6,
        status: "complete",
      },
      {
        id: "room-3-2",
        name: "IT Office",
        hasChildren: false,
        uploaded: 1,
        required: 4,
        status: "partial",
      },
    ],
  },
]

export default function SurveyFloors() {
  const [treeData, setTreeData] = useState<Floor[]>(mockTreeData)
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set(["room-1-2", "room-2-1"]))
  const [activeFloor, setActiveFloor] = useState<number>(1)
  const floorRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")

  const getStatusStyling = (status: string) => {
    switch (status) {
      case "pending":
        return { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" }
      case "partial":
        return { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" }
      case "complete":
        return { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" }
      default:
        return { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" }
    }
  }

  const toggleFloor = (floorId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTreeData((prev) => prev.map((floor) => (floor.id === floorId ? { ...floor, expanded: !floor.expanded } : floor)))
  }

  const toggleRoom = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedRooms((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(roomId)) {
        newSet.delete(roomId)
      } else {
        newSet.add(roomId)
      }
      return newSet
    })
  }

  const navigateToUpload = (
    entityType: "room" | "subroom",
    entityId: string,
    entityName: string,
    floorName: string,
  ) => {
    const breadcrumb = `Survey > ${floorName} > ${entityName}`
    router.push(
      `/user/survey/upload?entityType=${entityType}&id=${entityId}&roomName=${encodeURIComponent(entityName)}&breadcrumb=${encodeURIComponent(breadcrumb)}`,
    )
  }

  const renderTreeItem = (item: Room, level: number, floorName: string, isSubroom = false) => {
    const styling = getStatusStyling(item.status)
    const isExpanded = expandedRooms.has(item.id)
    // Floor header menggunakan px-4 (16px) + button + mr-2 = 16px + 24px + 8px = 48px dari kiri ke ikon
    // Room level 0 harus memiliki padding yang sama agar ikon sejajar
    const paddingLeft = level === 0 ? 48 : 48 + level * 24

    const handleItemClick = () => {
      if (item.hasChildren) {
        // For folders, toggle expand/collapse
        setExpandedRooms((prev) => {
          const newSet = new Set(prev)
          if (newSet.has(item.id)) {
            newSet.delete(item.id)
          } else {
            newSet.add(item.id)
          }
          return newSet
        })
      } else {
        // For files, navigate to upload
        navigateToUpload(isSubroom ? "subroom" : "room", item.id, item.name, floorName)
      }
    }

    return (
      <div key={item.id}>
        <div
          className="flex items-center py-2 px-2 hover:bg-gray-50 cursor-pointer min-h-[44px]"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={handleItemClick}
        >
          {item.hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleRoom(item.id, e)
              }}
              className="p-1 hover:bg-gray-200 rounded mr-2 -ml-6"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}

          <div className="mr-2">
            {item.hasChildren ? (
              <Folder size={16} className="text-blue-600" />
            ) : (
              <FileText size={16} className="text-gray-600" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center">
            <div className="font-medium text-sm text-gray-900 truncate">{item.name}</div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ml-2 ${styling.bg} ${styling.text}`}>
              {item.uploaded}/{item.required}
            </div>
          </div>
        </div>

        {item.hasChildren && isExpanded && item.children && (
          <div>{item.children.map((child) => renderTreeItem(child, level + 1, floorName, true))}</div>
        )}
      </div>
    )
  }

  const scrollToFloor = (floorNumber: number) => {
    const floorElement = floorRefs.current[floorNumber]
    if (floorElement) {
      floorElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      })
      setActiveFloor(floorNumber)
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const floorNumber = Number.parseInt(entry.target.getAttribute("data-floor") || "1")
            setActiveFloor(floorNumber)
          }
        })
      },
      { threshold: 0.5, rootMargin: "-20% 0px -20% 0px" },
    )

    Object.values(floorRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TechnicianHeader title="Survey - Tree View" showBackButton={true} backUrl="/user/dashboard" />

      <main className="p-4">
        <div className="max-w-4xl mx-auto flex gap-4">
          <div className="flex-1 max-w-md">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {treeData.map((floor) => (
                  <div
                    key={floor.id}
                    className="border-b border-gray-100 last:border-b-0"
                    ref={(el) => {
                      floorRefs.current[floor.floor_number] = el
                    }}
                    data-floor={floor.floor_number}
                  >
                    <div className="flex items-center py-3 px-4 bg-gray-50 hover:bg-gray-100 cursor-pointer min-h-[44px]">
                      <button onClick={(e) => toggleFloor(floor.id, e)} className="p-1 hover:bg-gray-200 rounded mr-2">
                        {floor.expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>

                      <Folder size={18} className="text-blue-600 mr-3" />

                      <div className="flex-1">
                        <h3 className="font-bold text-sm text-gray-900">{floor.name}</h3>
                        <div className="text-xs text-gray-500">{floor.rooms.length} ruangan</div>
                      </div>
                    </div>

                    {floor.expanded && (
                      <div className="bg-white">
                        {floor.rooms.length === 0 ? (
                          <div className="py-4 px-8 text-sm text-gray-500 text-center">Tidak ada ruangan</div>
                        ) : (
                          floor.rooms.map((room) => renderTreeItem(room, 0, floor.name))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <div className="text-xs font-medium text-gray-500 mb-2">Lantai</div>
            {treeData.map((floor) => (
              <button
                key={floor.floor_number}
                onClick={() => scrollToFloor(floor.floor_number)}
                className={`w-10 h-10 rounded-lg border-2 text-sm font-medium transition-all duration-200 ${
                  activeFloor === floor.floor_number
                    ? "bg-blue-600 text-white border-blue-600 shadow-md"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {floor.floor_number}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
