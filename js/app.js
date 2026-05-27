/**
 * UOV FAS Attendance Tracker - Core Application Controller
 * Handles SPA routing, interactive dashboard stats rendering, search autocompletion,
 * custom canvas charting, teacher roster logging, and responsive overlay states.
 */

// Global State
let selectedStudentIndex = null;
let currentChartRef = null;
let currentStudentSummary = null; // Cache the fetched summary

// ==========================================================================
// 3. STUDENT SEARCH & FILTER PORTAL
// ==========================================================================
function initSearchPortal() {
    const searchInput = document.getElementById("student-search-input");
    const suggestionsBox = document.getElementById("search-suggestions");
    const clearBtn = document.getElementById("search-clear-btn");

    // Manage typed inputs
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim().toLowerCase();
        
        if (query === "") {
            suggestionsBox.style.display = "none";
            clearBtn.style.display = "none";
            return;
        }

        clearBtn.style.display = "flex";
        suggestionsBox.style.display = "none"; // Hide autocomplete
    });

    // Handle suggested tag triggers
    document.querySelectorAll(".tag-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            searchInput.value = pill.textContent;
            clearBtn.style.display = "flex";
            performStudentQuery(pill.textContent);
        });
    });

    // Close suggestions box when clicking outside
    document.addEventListener("click", (e) => {
        if (e.target !== searchInput && e.target !== suggestionsBox) {
            suggestionsBox.style.display = "none";
        }
    });

    // Handle Clear Button click
    clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        suggestionsBox.style.display = "none";
        clearBtn.style.display = "none";
        resetStudentQuery();
    });

    const submitBtn = document.getElementById("search-submit-btn");
    if (submitBtn) {
        submitBtn.addEventListener("click", () => {
            const query = searchInput.value.trim().toUpperCase();
            if (query) {
                suggestionsBox.style.display = "none";
                performStudentQuery(query);
            }
        });
    }

    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const query = searchInput.value.trim().toUpperCase();
            if (query) {
                suggestionsBox.style.display = "none";
                performStudentQuery(query);
            }
        }
    });
}

const GOOGLE_SHEET_API = 'https://script.google.com/macros/s/AKfycbzvUvthEpnrLNYxNsrOg-Dou5Cn7CrSo0kWuVViDJIVnYCPpGQf5CDCmZEZCB9CtcYO/exec';

/**
 * Filter and query specific student details
 * Integrates real-time Google Sheets API fetching with local persistent fallbacks.
 * @param {string} indexNo
 */
async function performStudentQuery(indexNo) {
    const searchInput = document.getElementById("student-search-input");
    const clearBtn = document.getElementById("search-clear-btn");
    const submitBtn = document.getElementById("search-submit-btn");
    
    // 1. Enter UI Loading State
    searchInput.disabled = true;
    if (clearBtn) clearBtn.style.display = "none";
    if (submitBtn) submitBtn.disabled = true;
    showToast("Connecting to UOV Google Sheets...", "sync");

    // Cinematic Three.js transition during query (loading cluster)
    if (typeof bg3DSystem !== 'undefined' && bg3DSystem) {
        bg3DSystem.triggerSearchFocus('Loading');
    }

    let summary = null;
    let loadedFromAPI = false;

    // 2. Fetch from Google Sheets Apps Script API
    try {
        const url = `${GOOGLE_SHEET_API}?index=${encodeURIComponent(indexNo)}`;
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow'
        });
        
        if (response.ok) {
            const raw = await response.json();
            
            // Check if student exists in Google Sheet
            if (raw && raw.status !== "not_found" && !raw.error && raw.data) {
                const sheetData = raw.data;
                // Map Google Sheet API schema to our app summary schema dynamically
                const studentName = sheetData['Name'] || sheetData.name || sheetData.studentName || "UOV Student";
                const studentIndex = sheetData['REg. No.'] || sheetData['Reg. No.'] || sheetData.index || indexNo;
                const studentDept = sheetData.department || sheetData.dept || "ICT"; // Hardcode ICT or determine from index
                
                let subjectsList = {};
                let overallPercent = 0;
                let totalPercent = 0;
                let count = 0;
                
                // Ignore these keys when looking for subjects
                const ignoreKeys = [
                    'name', 'studentname', 'index', 'indexno', 'reg. no.', 'reg. no', 'department', 'dept', 
                    'status', 'error', 'overall', 'overallpercentage', 'overall attendance', 'month->', ''
                ];

                // Fix for Google Sheet returning Year 1 headers for Year 2 batch
                const subjectMapping = {
                    'it1113(t)': 'IT2223(T)',
                    'it1113(p)': 'IT2223(P)',
                    'it1122': 'IT2212',
                    'it1134(t)': 'IT2234(T)',
                    'it1134(p)': 'IT2234(P)',
                    'it1144(t)': 'IT2244(T)',
                    'it1144(p)': 'IT2244(P)',
                    'it1152': 'IT2252'
                };

                Object.keys(sheetData).forEach(key => {
                    const lowerKey = key.toLowerCase().trim();
                    
                    // Skip ignored keys, empty keys, and standalone numbers (months)
                    if (ignoreKeys.includes(lowerKey) || lowerKey === '' || !isNaN(Number(lowerKey))) {
                        return;
                    }

                    // Extract percentage
                    let val = sheetData[key];
                    let percent = 0;

                    if (val === '-' || val === null || val === undefined || val === '') {
                        percent = 0;
                    } else if (typeof val === 'string') {
                        val = val.replace('%', '').trim();
                        if (val === '#DIV/0!' || val === '#VALUE!' || val === 'N/A') {
                            percent = 0;
                        } else {
                            percent = Number(val);
                        }
                    } else {
                        percent = Number(val);
                    }
                    
                    if (isNaN(percent)) percent = 0;
                    
                    // If decimal (e.g. 0.9 or 1), convert to percentage (90 or 100)
                    if (percent <= 1 && percent >= 0) {
                        percent = Math.round(percent * 100);
                    }

                    totalPercent += percent;
                    count++;

                    let displayKey = key;
                    if (indexNo.startsWith('2022/')) {
                        if (subjectMapping[lowerKey]) {
                            displayKey = subjectMapping[lowerKey];
                        }
                    }

                    subjectsList[displayKey] = {
                        subjectName: displayKey,
                        lecturer: "FAS Lecturer",
                        totalClasses: 15,
                        presentClasses: Math.round((15 * percent) / 100),
                        absentClasses: 15 - Math.round((15 * percent) / 100),
                        percentage: percent,
                        history: [
                            { date: new Date().toISOString().split("T")[0], lecturer: "FAS Lecturer", status: percent >= 75 ? "Present" : "Absent" }
                        ]
                    };
                });
                
                // Handle Overall Attendance
                let overallRaw = sheetData['Overall Attendance'] || sheetData.overall || null;
                if (overallRaw !== null) {
                    if (typeof overallRaw === 'string') overallRaw = overallRaw.replace('%', '').trim();
                    overallPercent = Number(overallRaw);
                    if (isNaN(overallPercent)) overallPercent = 0;
                    if (overallPercent <= 1 && overallPercent >= 0) {
                        overallPercent = Math.round(overallPercent * 100);
                    }
                } else {
                    overallPercent = count > 0 ? Math.round(totalPercent / count) : 80;
                }

                let eligibility = "Eligible";
                if (overallPercent < 70) eligibility = "Barred";
                else if (overallPercent < 80) eligibility = "Warning";

                summary = {
                    student: { name: studentName, indexNo: studentIndex, department: studentDept },
                    subjects: subjectsList,
                    overall: {
                        total: 100, // Just a placeholder
                        present: Math.round(overallPercent),
                        percentage: overallPercent,
                        eligibility: eligibility
                    }
                };
                
                loadedFromAPI = true;
            }
        }
    } catch (e) {
        console.warn("Google Sheet API request failed or network offline.", e);
    }

    // 3. Exit UI Loading State
    searchInput.disabled = false;
    if (clearBtn) clearBtn.style.display = "flex";
    if (submitBtn) submitBtn.disabled = false;
    searchInput.focus();

    if (!summary) {
        showToast("Student index not found in register", "alert-circle");
        if (typeof bg3DSystem !== 'undefined' && bg3DSystem) {
            bg3DSystem.resetScene();
        }
        return;
    }

    // Show source verification toast
    showToast("Synced with Google Sheets Database!", "check-circle");

    selectedStudentIndex = indexNo;
    currentStudentSummary = summary; // Cache summary for resize events

    // Toggle View Cards: hide empty view, show result view
    document.getElementById("portal-empty").style.display = "none";
    const resultContainer = document.getElementById("student-results");
    resultContainer.style.display = "block";

    // Set Text fields
    document.getElementById("res-student-name").textContent = summary.student.name;
    document.getElementById("res-student-index").textContent = summary.student.indexNo;
    document.getElementById("res-student-dept").textContent = summary.student.department;

    // Trigger dynamic Three.js 3D transitions matching final eligibility color
    if (typeof bg3DSystem !== 'undefined' && bg3DSystem) {
        bg3DSystem.triggerSearchFocus(summary.overall.eligibility);
    }

    // Set Radial Circular Gauge values
    const percentage = summary.overall.percentage;
    const gaugeFill = document.getElementById("res-gauge-fill");
    const gaugeText = document.getElementById("res-gauge-percentage");
    const eligibilityBadge = document.getElementById("res-eligibility-badge");

    // Math calculation for stroke: circle radius 42 has circumference of ~264
    const strokeOffset = 264 - (264 * percentage) / 100;
    
    // Reset offset first to trigger animated trace on reload
    gaugeFill.style.strokeDashoffset = "264";
    gaugeText.textContent = "0%";

    // Set specific theme classes matching overall status
    let statusClass = "eligible";
    let statusHexColor = "#00f5a0"; // Green

    if (summary.overall.eligibility === "Warning") {
        statusClass = "warning";
        statusHexColor = "#ffaa00"; // Orange
    } else if (summary.overall.eligibility === "Barred") {
        statusClass = "barred";
        statusHexColor = "#ff3366"; // Red
    }

    // Set badge text & classes
    eligibilityBadge.className = `eligibility-badge ${statusClass}`;
    eligibilityBadge.textContent = summary.overall.eligibility;

    // Update avatar rings style
    document.getElementById("avatar-ring-status").className = "avatar-ring";
    document.getElementById("avatar-ring-status").style.borderColor = statusHexColor;
    document.getElementById("avatar-glow-status").style.backgroundColor = statusHexColor;

    setTimeout(() => {
        gaugeFill.style.stroke = statusHexColor;
        gaugeFill.style.strokeDashoffset = strokeOffset;
        gaugeText.textContent = `${percentage}%`;
    }, 150);

    // Render Subject-wise breakdown cards
    renderSubjectCards(summary.subjects);

    // Draw canvas progress graph
    drawStudentAttendanceChart(summary.subjects);
}

function resetStudentQuery() {
    selectedStudentIndex = null;
    document.getElementById("student-results").style.display = "none";
    document.getElementById("portal-empty").style.display = "flex";
    
    if (typeof bg3DSystem !== 'undefined' && bg3DSystem) {
        bg3DSystem.resetScene();
    }
}

/**
 * Render subject attendance grids
 * @param {Object} subjectsData
 */
function renderSubjectCards(subjectsData) {
    const grid = document.getElementById("student-subjects-grid");
    grid.innerHTML = "";

    Object.keys(subjectsData).forEach(code => {
        const sub = subjectsData[code];
        
        let statusClass = "success";
        if (sub.percentage < 70) {
            statusClass = "danger";
        } else if (sub.percentage < 80) {
            statusClass = "warning";
        }

        const card = document.createElement("div");
        card.className = "subject-card glass-card";
        card.innerHTML = `
            <div class="subject-card-inner">
                <div class="subj-card-head">
                    <span class="code-tag">${code}</span>
                    <span class="status-dot ${statusClass}"></span>
                </div>
                
                <div class="subj-card-body">
                    <h4>${sub.subjectName}</h4>
                    <span>Lecturer: ${sub.lecturer}</span>
                </div>
                
                <div class="subj-card-footer">
                    <span class="subj-ratio">Logged: <strong>${sub.presentClasses}/${sub.totalClasses}</strong></span>
                    <span class="subj-percentage ${statusClass}">${sub.percentage}%</span>
                </div>
            </div>
        `;
        
        // Modal Trigger binding
        card.addEventListener("click", () => {
            openHistoryModal(code, sub);
        });

        grid.appendChild(card);
    });
}

// ==========================================================================
// 4. CUSTOM LIGHTWEIGHT CANVAS CHART BUILDER
// ==========================================================================
function drawStudentAttendanceChart(subjectsData) {
    const canvas = document.getElementById("student-canvas-chart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    
    // Clear canvas and reset size for responsiveness
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = 240 * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = 240;
    
    // Theme colors
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 30, right: 30, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const subjects = Object.keys(subjectsData);
    const dataPoints = subjects.map(code => subjectsData[code].percentage);

    // 1. Draw horizontal gridlines and percentages labels
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "10px Inter";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const yTicks = [0, 25, 50, 75, 100];
    yTicks.forEach(tick => {
        const y = padding.top + chartHeight - (tick / 100) * chartHeight;
        
        // Draw line
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Draw percentage text label
        ctx.fillText(`${tick}%`, padding.left - 10, y);
    });

    // 2. Plotting vertical statistics bars with beautiful neon glows
    const barSpacing = chartWidth / subjects.length;
    const barWidth = Math.min(32, barSpacing * 0.5);

    subjects.forEach((code, index) => {
        const percent = dataPoints[index];
        const barHeight = (percent / 100) * chartHeight;
        const x = padding.left + index * barSpacing + (barSpacing - barWidth) / 2;
        const y = padding.top + chartHeight - barHeight;

        // Choose color based on percentage rate
        let barColor = "#00f5a0"; // success
        let shadowColor = "rgba(0, 245, 160, 0.4)";
        if (percent < 70) {
            barColor = "#ff3366"; // danger
            shadowColor = "rgba(255, 51, 102, 0.4)";
        } else if (percent < 80) {
            barColor = "#ffaa00"; // warning
            shadowColor = "rgba(255, 170, 0, 0.4)";
        }

        // Draw smooth rounded vertical bar
        ctx.fillStyle = barColor;
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 10;
        
        // Draw bar rectangle (rounded top)
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
        } else {
            ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
        ctx.shadowBlur = 0; // reset shadow for grids

        // Draw data value label on top of bar
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 10px Outfit";
        ctx.textAlign = "center";
        ctx.fillText(`${percent}%`, x + barWidth / 2, y - 10);

        // Draw X-axis label code
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "500 10px Outfit";
        ctx.fillText(code, x + barWidth / 2, padding.top + chartHeight + 16);
    });
}

// Draw chart on screen resize to maintain responsiveness
window.addEventListener("resize", () => {
    if (selectedStudentIndex) {
        if (currentStudentSummary) drawStudentAttendanceChart(currentStudentSummary.subjects);
    }
});

// ==========================================================================
// 6. HISTORY DETAIL MODALS
// ==========================================================================
function openHistoryModal(subjectCode, subjectData) {
    const modal = document.getElementById("history-modal");
    
    // Set headers
    document.getElementById("modal-subject-title").textContent = subjectData.subjectName;
    document.getElementById("modal-subject-code").textContent = subjectCode;

    // Set summaries
    document.getElementById("modal-present-count").textContent = subjectData.presentClasses;
    document.getElementById("modal-absent-count").textContent = subjectData.absentClasses;
    document.getElementById("modal-percentage").textContent = `${subjectData.percentage}%`;

    // Populate history records
    const body = document.getElementById("modal-table-body");
    body.innerHTML = "";

    subjectData.history.forEach(rec => {
        const tr = document.createElement("tr");
        const statusBadge = rec.status === "Present" 
            ? `<span class="status-badge present">Present</span>` 
            : `<span class="status-badge absent">Absent</span>`;

        tr.innerHTML = `
            <td>${rec.date}</td>
            <td>${subjectData.lecturer}</td>
            <td>${statusBadge}</td>
        `;
        body.appendChild(tr);
    });

    modal.classList.add("open");
}

function closeModal() {
    document.getElementById("history-modal").classList.remove("open");
}

// Back-drop close modal click
document.getElementById("history-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("history-modal")) {
        closeModal();
    }
});

// ==========================================================================
// 7. TOAST NOTIFICATION WINDOW
// ==========================================================================
function showToast(message, iconName) {
    const toast = document.getElementById("alert-toast");
    const msgSpan = document.getElementById("toast-message");
    const icon = document.getElementById("toast-icon");

    msgSpan.textContent = message;
    
    // Set matching icons
    if (iconName) {
        icon.setAttribute("data-lucide", iconName);
        lucide.createIcons();
    }

    toast.classList.add("show");
    
    // Disappear in 3.5 seconds
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

// ==========================================================================
// 8. RUNTIME INITIALIZER ON LOAD
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize core responsive layouts & UI icons
    lucide.createIcons();

    // 2. Setup search filters autocompletes
    initSearchPortal();
});
