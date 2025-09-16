"use client";

import React, { useMemo } from "react";
import {
  UIProject,
  UITechnician,
  CellAssignment,
} from "@/components/assign/types";
import {
  truncateText,
  getProgressStatus,
  getManDaysDisplay,
  getManDaysStatus,
  getProjectStatusDisplay,
} from "@/components/assign/helpers";

/* ================== DATA KENDARAAN (30 item) ================== */
const VEHICLES: { name: string; plate: string }[] = [
  { name: " Avanza", plate: "L 1992 KK" },
  { name: "Brio", plate: "B 1321 XY" },
  { name: "Ertiga", plate: "D 8875 ZQ" },
  { name: "Xpander", plate: "H 2456 AN" },
  { name: "Terios", plate: "N 7719 JP" },
  { name: "Creta", plate: "W 3008 QN" },
  { name: "Sonet", plate: "F 9912 RT" },
  { name: "Fortuner", plate: "E 5432 LM" },
  { name: "CR-V", plate: "AB 1830 CD" },
  { name: "Livina", plate: "AE 6021 VK" },
  { name: "Almaz", plate: "AD 7044 QS" },
  { name: "CX-5", plate: "K 2711 UF" },
  { name: "Raize", plate: "S 8320 AZ" },
  { name: "Sigra", plate: "AG 4507 DT" },
  { name: "HR-V", plate: "B 8899 GH" },
  { name: "Pajero", plate: "L 1203 MN" },
  { name: "Innova", plate: "H 5522 RP" },
  { name: "Seltos", plate: "N 7654 YB" },
  { name: "Stargazer", plate: "W 1145 CE" },
  { name: "Calya", plate: "F 3391 PX" },
  { name: "XL7", plate: "E 6610 JT" },
  { name: "BR-V", plate: "AB 9042 LA" },
  { name: "DFSK Glory", plate: "AE 2213 NB" },
  { name: "X-Trail", plate: "AD 7788 CK" },
  { name: "Forester", plate: "K 5501 VW" },
  { name: "Yaris", plate: "S 9900 OP" },
  { name: "Jazz", plate: "AG 1122 QL" },
  { name: "Zenix 2", plate: "B 4120 ZS" },
  { name: "MG ZS", plate: "L 6608 TR" },
  { name: "Omoda", plate: "H 3479 UA" },
];

// inisial: 1 huruf pertama (diambil dari kata terakhir yang berhuruf)
// contoh: "Toyota Avanza" -> "A"
function vehicleInitial(name: string) {
  const raw = String(name || "").trim();
  if (!raw) return "?";
  const tokens = raw.split(/\s+/);
  let token = tokens[tokens.length - 1];
  if (!/[A-Za-z\u00C0-\u024F]/.test(token)) token = tokens[0];
  const ch = (token.match(/[A-Za-z\u00C0-\u024F]/) || [token[0] || "?"])[0];
  return (ch || "?").toUpperCase();
}

type Props = {
  projects: UIProject[];
  assignments: CellAssignment[];

  onCellClick: (projectId: string, technicianId: string) => void;
  onCellDoubleClick: (projectId: string, technicianId: string) => void;
  onStatusDoubleClick: (project: UIProject) => void;
  onProjectNameRightClick: (e: React.MouseEvent, project: UIProject) => void;

  getCellAssignment: (
    projectId: string,
    technicianId: string
  ) => CellAssignment | undefined;
  getTechnicianTrackNumber: (technicianId: string) => number; // tidak ditampilkan, tapi biarkan tipe kompatibel
  getProjectAssignmentCount: (projectId: string) => number;

  tableRef?: React.RefObject<HTMLTableElement>;
};

export default function ProjectTableCars({
  projects,
  assignments,
  onCellClick,
  onCellDoubleClick,
  onStatusDoubleClick,
  onProjectNameRightClick,
  getCellAssignment,
  getTechnicianTrackNumber,
  getProjectAssignmentCount,
  tableRef,
}: Props) {
  // tampilkan SEMUA 30 kendaraan sebagai "teknisi"
  const allTechs: UITechnician[] = useMemo(
    () =>
      VEHICLES.map((v, i) => ({
        id: `car-${String(i + 1).padStart(2, "0")}`,
        name: v.name,
        inisial: vehicleInitial(v.name),
      })),
    []
  );

  const totalAssignments = assignments.filter(
    (a) => a.isSelected || a.isProjectLeader
  ).length;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-xs">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-gray-900 border-r border-gray-300 w-28">
                Nama Proyek
              </th>

              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-10">
                <div className="flex flex-col items-center justify-end h-full">
                  <div className="text-lg font-bold">Σ</div>
                </div>
              </th>

              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-16">
                Man Days
              </th>
              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-16">
                Progress (Hari)
              </th>
              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-14">
                Datang
              </th>
              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-14">
                Pulang
              </th>

              {/* === HEADER KENDARAAN: nama + no. polisi (dua baris, vertical & italic) === */}
              {allTechs.map((t, i) => {
                const plate = VEHICLES[i]?.plate ?? "";
                return (
                  <th
                    key={t.id}
                    className="px-1 py-4 text-center font-semibold text-gray-900 border-r border-gray-300 w-8 sticky top-0 bg-gray-100 h-36"
                    title={`${t.name} — ${plate}`}
                  >
                    <div className="flex flex-col items-center justify-end h-full">

                    {/* No. Polisi (vertical, gaya sama, sedikit lebih kecil) */}
                      <div
                        className="text-[10px] italic whitespace-nowrap"
                        style={{
                          writingMode: "vertical-lr",
                          textOrientation: "mixed",
                          transform: "rotate(180deg)",
                          height: "52px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          lineHeight: 1.1,
                        }}
                      >
                        {plate}
                      </div>

                       {/* Nama kendaraan (vertical)*/}
                      <div
                        className="text-[10px] font-bold whitespace-nowrap mb-1"
                        style={{
                          writingMode: "vertical-lr",
                          textOrientation: "mixed",
                          transform: "rotate(180deg)",
                          height: "84px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          lineHeight: 1.1,
                        }}
                      >
                        {t.name}
                       </div>
                    </div>
                  </th>
                );
              })}

              <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                Status
              </th>
              <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                Sales
              </th>
            </tr>
          </thead>

          <tbody>
            {projects.map((project, idx) => {
              const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
              const progress = getProgressStatus(project);
              const sigmaCurrent = getProjectAssignmentCount(project.id);
              const sigmaTarget = project.sigmaTeknisi ?? 0;
              const sigmaOver = sigmaCurrent > sigmaTarget;
              const manDisp = getManDaysDisplay(project);
              const manSt = getManDaysStatus(project);
              const statusDisp = getProjectStatusDisplay(project);
              const isLockedRow =
                project.projectStatus === "pending" ||
                project.projectStatus === "awaiting_bast" ||
                project.status === "completed";
              const rowKey = `${project.id ?? "noid"}-${
                project.jobId ?? "nojob"
              }-${idx}`;

              return (
                <tr key={rowKey} className={rowBg}>
                  <td
                    className={`px-1 py-1 border-r border-gray-200 font-medium ${rowBg}`}
                  >
                    <div
                      className="text-xs font-semibold cursor-pointer hover:bg-blue-50 px-1 py-1 rounded transition-colors"
                      onContextMenu={(e) => onProjectNameRightClick(e, project)}
                      title={
                        project.jobId
                          ? "Klik kanan untuk shortcut Generate Laporan (DOCX)"
                          : "Job ID belum tersedia"
                      }
                    >
                      {project.name}
                    </div>
                    <div className="text-[9px] text-gray-500 leading-tight">
                      {project.jobId}
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 font-semibold ${rowBg}`}
                  >
                    <div
                      className={`text-xs font-bold ${
                        sigmaOver
                          ? "text-red-600 font-semibold"
                          : "text-gray-900"
                      }`}
                    >
                      {sigmaCurrent}/{sigmaTarget}
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div
                      className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${manSt.bgColor} ${manSt.textColor}`}
                    >
                      <span>{manDisp.display}</span>
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div
                      className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${progress.bgColor} ${progress.textColor}`}
                    >
                      <span>{progress.display}</span>
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 text-xs ${rowBg}`}
                  >
                    {project.jamDatang}
                  </td>
                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 text-xs ${rowBg}`}
                  >
                    {project.jamPulang}
                  </td>

                  {/* Matriks cell kendaraan */}
                  {allTechs.map((t) => {
                    const a = getCellAssignment(project.id, t.id);
                    const isSel = a?.isSelected === true;
                    const isLead = a?.isProjectLeader === true;

                    let cellBg = rowBg;
                    let textColor = "text-gray-900";
                    let disp = "";
                    if (isLead) {
                      cellBg = "bg-red-500";
                      textColor = "text-white";
                      disp = a?.inisial || t.inisial;
                    } else if (isSel) {
                      cellBg = "bg-blue-200";
                      textColor = "text-blue-900";
                      disp = a?.inisial || t.inisial;
                    }

                    const disabledCell = isLockedRow;

                    return (
                      <td
                        key={`${project.id}-${t.id}`}
                        className={`px-1 py-1 text-center border-r border-gray-200 ${
                          disabledCell
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:bg-blue-100"
                        } transition-colors ${cellBg}`}
                        onClick={() =>
                          !disabledCell && onCellClick(project.id, t.id)
                        }
                        onDoubleClick={() =>
                          !disabledCell && onCellDoubleClick(project.id, t.id)
                        }
                        title={
                          disabledCell
                            ? project.projectStatus === "pending"
                              ? "Proyek sedang pending"
                              : "Proyek telah selesai"
                            : isLead
                            ? `${t.name} (Project Leader)`
                            : isSel
                            ? `${t.name} (Assigned)`
                            : `Assign ${t.name}`
                        }
                      >
                        <div
                          className={`h-4 w-4 mx-auto flex items-center justify-center rounded font-bold text-xs ${textColor}`}
                        >
                          {disp}
                        </div>
                      </td>
                    );
                  })}

                  <td
                    className={`px-1 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${statusDisp.bgColor} ${statusDisp.textColor}`}
                      title={
                        project.projectStatus === "pending" &&
                        project.pendingReason
                          ? project.pendingReason
                          : statusDisp.label
                      }
                      onDoubleClick={() => onStatusDoubleClick(project)}
                    >
                      {project.projectStatus === "pending" &&
                      project.pendingReason
                        ? truncateText(project.pendingReason)
                        : statusDisp.label}
                    </div>
                  </td>

                  <td
                    className={`px-1 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div className="px-2 py-1 text-xs font-medium text-gray-700">
                      {project.sales ? truncateText(project.sales, 25) : "-"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
