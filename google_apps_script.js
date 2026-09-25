/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: SIM-GURU BAHASA INDONESIA SMA
 * ==============================================================================
 * Script ini menghubungkan aplikasi web SIM-Guru Bahasa Indonesia dengan Google Sheets.
 * Seluruh data (Presensi Harian, Rekapitulasi, Data Siswa, Kelas, dan Bank Soal)
 * akan tersimpan secara otomatis, aman, dan terpusat di Google Spreadsheet ini.
 * 
 * PANDUAN PEMASANGAN:
 * 1. Buat Spreadsheet baru di Google Sheets (sheets.google.com).
 * 2. Buka menu: Ekstensi (Extensions) > Apps Script.
 * 3. Hapus semua kode default di editor, lalu paste (tempel) seluruh isi file ini.
 * 4. Klik tombol "Simpan" (ikon disket).
 * 5. Klik "Terapkan" (Deploy) > "Kelola Penyiapan" / "Deployment baru" (New deployment).
 * 6. Pilih jenis: "Aplikasi Web" (Web app).
 * 7. Pada konfigurasi:
 *    - Deskripsi: SIM-Guru Backend API
 *    - Jalankan sebagai (Execute as): Saya (Me / email Anda)
 *    - Siapa yang memiliki akses (Who has access): Siapa saja (Anyone) -> [PENTING!]
 * 8. Klik "Terapkan" (Deploy), berikan izin akses (Authorize access jika diminta).
 * 9. Salin "URL Aplikasi Web" (akhiran /exec) dan tempelkan ke aplikasi web SIM-Guru.
 * ==============================================================================
 */

// Konstanta Nama Sheet
var SHEET_NAMES = {
  PRESENSI: "Presensi",
  SISWA: "Data_Siswa",
  KELAS: "Data_Kelas",
  SOAL: "Bank_Soal",
  STATE: "_APP_STATE"
};

/**
 * Endpoint HTTP GET: Mengambil data atau cek status koneksi
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || "ping";
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Cek Koneksi (Ping)
    if (action === "ping") {
      return createJsonResponse({
        status: "success",
        message: "Koneksi ke Google Sheets berhasil!",
        sheetTitle: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        timestamp: new Date().toISOString()
      });
    }

    // 2. Ambil Seluruh Data Aplikasi (Get Data)
    if (action === "getData") {
      initAllSheets(ss);
      var stateSheet = ss.getSheetByName(SHEET_NAMES.STATE);
      var stateCell = stateSheet.getRange("A1").getValue();

      if (stateCell && typeof stateCell === "string" && stateCell.trim().startsWith("{")) {
        try {
          var parsedData = JSON.parse(stateCell);
          return createJsonResponse({
            status: "success",
            data: parsedData,
            source: "app_state_cache",
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          // Jika gagal parse, lanjut membaca dari sheet tabel
        }
      }

      // Jika belum ada di _APP_STATE, baca dari sheet data tabel
      var extractedData = extractDataFromTables(ss);
      return createJsonResponse({
        status: "success",
        data: extractedData,
        source: "table_sheets",
        timestamp: new Date().toISOString()
      });
    }

    return createJsonResponse({
      status: "error",
      message: "Action tidak dikenal: " + action
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Endpoint HTTP POST: Menyimpan data ke Google Sheets
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: "error",
        message: "Tidak ada data post payload yang diterima."
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    initAllSheets(ss);

    // =========================================================================
    // AKSI 1: SIMPAN SELURUH DATA / SINKRONISASI LENGKAP (SYNC ALL)
    // =========================================================================
    if (action === "syncAll" || action === "saveState") {
      var appData = payload.data || {};

      // 1. Simpan backup JSON lengkap di sheet _APP_STATE
      var stateSheet = ss.getSheetByName(SHEET_NAMES.STATE);
      stateSheet.getRange("A1").setValue(JSON.stringify(appData));
      stateSheet.getRange("A2").setValue("Terakhir Diperbarui: " + new Date().toLocaleString("id-ID"));

      // 2. Tulis tabel Data_Kelas
      if (appData.classesMeta && Array.isArray(appData.classesMeta)) {
        writeClassesSheet(ss, appData.classesMeta);
      }

      // 3. Tulis tabel Data_Siswa
      if (appData.studentsDatabase && typeof appData.studentsDatabase === "object") {
        writeStudentsSheet(ss, appData.classesMeta || [], appData.studentsDatabase);
      }

      // 4. Tulis tabel Presensi
      if (appData.attendanceDatabase && typeof appData.attendanceDatabase === "object") {
        writeAttendanceSheet(ss, appData.classesMeta || [], appData.studentsDatabase || {}, appData.attendanceDatabase);
      }

      // 5. Tulis tabel Bank_Soal
      if (appData.customQuestions && Array.isArray(appData.customQuestions)) {
        writeQuestionsSheet(ss, appData.customQuestions);
      }

      return createJsonResponse({
        status: "success",
        message: "Semua data berhasil disinkronkan dan tersimpan rapi di Google Sheets!",
        spreadsheetUrl: ss.getUrl(),
        timestamp: new Date().toISOString()
      });
    }

    // =========================================================================
    // AKSI 2: SIMPAN PRESENSI HARIAN KELAS
    // =========================================================================
    if (action === "saveAttendance") {
      var classId = payload.classId;
      var className = payload.className || classId;
      var date = payload.date;
      var topic = payload.topic || "-";
      var records = payload.records || []; // [{ nis, name, gender, status, note }]

      var presensiSheet = ss.getSheetByName(SHEET_NAMES.PRESENSI);
      var timestamp = new Date().toLocaleString("id-ID");

      // Cek apakah data tanggal & kelas ini sudah ada, jika ada kita perbarui / hapus yang lama
      var existingData = presensiSheet.getDataRange().getValues();
      var rowsToKeep = [];

      // Baris 0 adalah Header
      if (existingData.length > 0) {
        rowsToKeep.push(existingData[0]);
      }

      for (var i = 1; i < existingData.length; i++) {
        var row = existingData[i];
        var rowDate = formatDateToString(row[1]);
        var rowClass = String(row[2]);

        // Jika bukan tanggal & kelas yang sedang diupdate, simpan
        if (!(rowDate === String(date) && rowClass === String(classId))) {
          rowsToKeep.push(row);
        }
      }

      // Tambahkan data presensi baru
      records.forEach(function (rec) {
        rowsToKeep.push([
          timestamp,
          date,
          classId,
          className,
          "'" + (rec.nis || ""),
          "'" + (rec.nisn || ""),
          rec.name || "",
          rec.gender || "",
          rec.status || "H",
          rec.note || "",
          topic
        ]);
      });

      // Tulis ulang ke sheet
      presensiSheet.clearContents();
      if (rowsToKeep.length > 0) {
        presensiSheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
      }

      // Perbarui juga data di cache _APP_STATE jika ada
      updateStateCacheAttendance(ss, classId, date, records);

      formatSheetHeader(presensiSheet, "#0284c7");

      return createJsonResponse({
        status: "success",
        message: "Presensi kelas " + className + " tanggal " + date + " berhasil disimpan ke Google Sheets!",
        totalSiswa: records.length,
        timestamp: timestamp
      });
    }

    // =========================================================================
    // AKSI 3: SIMPAN / TAMBAH / UBAH DATA SISWA
    // =========================================================================
    if (action === "saveStudentList") {
      var classId = payload.classId;
      var className = payload.className || classId;
      var students = payload.students || [];

      var siswaSheet = ss.getSheetByName(SHEET_NAMES.SISWA);
      var allData = siswaSheet.getDataRange().getValues();
      var filteredRows = [];

      if (allData.length > 0) {
        filteredRows.push(allData[0]); // Header
      }

      for (var j = 1; j < allData.length; j++) {
        if (String(allData[j][0]) !== String(classId)) {
          filteredRows.push(allData[j]);
        }
      }

      var now = new Date().toLocaleString("id-ID");
      students.forEach(function (s) {
        filteredRows.push([
          classId,
          className,
          "'" + (s.nis || ""),
          "'" + (s.nisn || ""),
          s.name || "",
          s.gender || "L",
          now
        ]);
      });

      siswaSheet.clearContents();
      if (filteredRows.length > 0) {
        siswaSheet.getRange(1, 1, filteredRows.length, filteredRows[0].length).setValues(filteredRows);
      }
      formatSheetHeader(siswaSheet, "#059669");

      // Perbarui juga data di cache _APP_STATE
      updateStateCacheStudents(ss, classId, students);

      return createJsonResponse({
        status: "success",
        message: "Daftar siswa kelas " + className + " berhasil diperbarui di Google Sheets!"
      });
    }

    // =========================================================================
    // AKSI 4: TAMBAH SOAL ASESMEN BARU
    // =========================================================================
    if (action === "saveQuestion") {
      var q = payload.question;
      var soalSheet = ss.getSheetByName(SHEET_NAMES.SOAL);
      var now = new Date().toLocaleString("id-ID");

      soalSheet.appendRow([
        q.id || ("soal_" + Date.now()),
        q.grade || "10",
        q.type || "Formatif",
        q.level || "HOTS",
        q.topic || "",
        q.stimulus || "",
        q.question || "",
        q.answer || "",
        now
      ]);

      formatSheetHeader(soalSheet, "#7c3aed");

      return createJsonResponse({
        status: "success",
        message: "Butir soal berhasil ditambahkan ke Bank Soal di Google Sheets!"
      });
    }

    return createJsonResponse({
      status: "error",
      message: "Aksi tidak dikenali: " + action
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString(),
      stack: error.stack
    });
  }
}

/**
 * Inisialisasi seluruh sheet dengan header dan format rapi
 */
function initAllSheets(ss) {
  // 1. Sheet Presensi
  var pSheet = getOrCreateSheet(ss, SHEET_NAMES.PRESENSI);
  if (pSheet.getLastRow() === 0) {
    pSheet.appendRow([
      "Waktu Pencatatan", "Tanggal", "ID Kelas", "Nama Kelas",
      "NIS", "NISN", "Nama Siswa", "L/P", "Status (H/S/I/A)",
      "Catatan Keaktifan/Sikap", "Materi Pembelajaran"
    ]);
    formatSheetHeader(pSheet, "#0284c7");
  }

  // 2. Sheet Data Siswa
  var sSheet = getOrCreateSheet(ss, SHEET_NAMES.SISWA);
  if (sSheet.getLastRow() === 0) {
    sSheet.appendRow([
      "ID Kelas", "Nama Kelas", "NIS", "NISN",
      "Nama Siswa", "Jenis Kelamin", "Terakhir Diperbarui"
    ]);
    formatSheetHeader(sSheet, "#059669");
  }

  // 3. Sheet Data Kelas
  var kSheet = getOrCreateSheet(ss, SHEET_NAMES.KELAS);
  if (kSheet.getLastRow() === 0) {
    kSheet.appendRow([
      "ID Kelas", "Nama Kelas", "Tingkat (Fase)", "Terakhir Diperbarui"
    ]);
    formatSheetHeader(kSheet, "#d97706");
  }

  // 4. Sheet Bank Soal
  var bSheet = getOrCreateSheet(ss, SHEET_NAMES.SOAL);
  if (bSheet.getLastRow() === 0) {
    bSheet.appendRow([
      "ID Soal", "Tingkat Kelas", "Kategori Asesmen", "Level Kognitif",
      "Topik Materi", "Stimulus / Teks Bacaan", "Butir Pertanyaan",
      "Kunci Jawaban & Rubrik", "Tanggal Dibuat"
    ]);
    formatSheetHeader(bSheet, "#7c3aed");
  }

  // 5. Sheet State Backup
  var stateSheet = getOrCreateSheet(ss, SHEET_NAMES.STATE);
  if (stateSheet.isSheetHidden() === false) {
    // Opsional: sheet state dibiarkan terbuka atau disembunyikan
  }
}

/**
 * Helper untuk mendapatkan atau membuat Sheet baru
 */
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * Format Header Sheet (Warna latar, teks putih tebal, freeze baris atas)
 */
function formatSheetHeader(sheet, bgColor) {
  try {
    var headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1);
    headerRange.setBackground(bgColor);
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    headerRange.setFontFamily("Arial");
    headerRange.setFontSize(10);
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 32);
  } catch (e) {}
}

/**
 * Tulis Sheet Data Kelas
 */
function writeClassesSheet(ss, classesMeta) {
  var sheet = ss.getSheetByName(SHEET_NAMES.KELAS);
  sheet.clearContents();
  sheet.appendRow(["ID Kelas", "Nama Kelas", "Tingkat (Fase)", "Terakhir Diperbarui"]);

  var now = new Date().toLocaleString("id-ID");
  var rows = classesMeta.map(function (c) {
    return [c.id, c.name, "Kelas " + c.grade, now];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  formatSheetHeader(sheet, "#d97706");
}

/**
 * Tulis Sheet Data Siswa
 */
function writeStudentsSheet(ss, classesMeta, studentsDatabase) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SISWA);
  sheet.clearContents();
  sheet.appendRow(["ID Kelas", "Nama Kelas", "NIS", "NISN", "Nama Siswa", "Jenis Kelamin", "Terakhir Diperbarui"]);

  var now = new Date().toLocaleString("id-ID");
  var rows = [];

  classesMeta.forEach(function (cls) {
    var students = studentsDatabase[cls.id] || [];
    students.forEach(function (s) {
      rows.push([
        cls.id,
        cls.name,
        "'" + (s.nis || ""),
        "'" + (s.nisn || ""),
        s.name || "",
        s.gender || "L",
        now
      ]);
    });
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }
  formatSheetHeader(sheet, "#059669");
}

/**
 * Tulis Sheet Presensi
 */
function writeAttendanceSheet(ss, classesMeta, studentsDatabase, attendanceDatabase) {
  var sheet = ss.getSheetByName(SHEET_NAMES.PRESENSI);
  sheet.clearContents();
  sheet.appendRow([
    "Waktu Pencatatan", "Tanggal", "ID Kelas", "Nama Kelas",
    "NIS", "NISN", "Nama Siswa", "L/P", "Status (H/S/I/A)",
    "Catatan Keaktifan/Sikap", "Materi Pembelajaran"
  ]);

  var now = new Date().toLocaleString("id-ID");
  var rows = [];

  Object.keys(attendanceDatabase).forEach(function (classId) {
    var cls = classesMeta.find(function (c) { return c.id === classId; }) || { name: classId };
    var students = studentsDatabase[classId] || [];
    var classAttendance = attendanceDatabase[classId];

    Object.keys(classAttendance).forEach(function (date) {
      var dayRecords = classAttendance[date];
      students.forEach(function (s) {
        var rec = dayRecords[s.nis] || { status: "H", note: "" };
        rows.push([
          now,
          date,
          classId,
          cls.name,
          "'" + (s.nis || ""),
          "'" + (s.nisn || ""),
          s.name || "",
          s.gender || "L",
          rec.status || "H",
          rec.note || "",
          "-"
        ]);
      });
    });
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 11).setValues(rows);
  }
  formatSheetHeader(sheet, "#0284c7");
}

/**
 * Tulis Sheet Bank Soal
 */
function writeQuestionsSheet(ss, questions) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SOAL);
  sheet.clearContents();
  sheet.appendRow([
    "ID Soal", "Tingkat Kelas", "Kategori Asesmen", "Level Kognitif",
    "Topik Materi", "Stimulus / Teks Bacaan", "Butir Pertanyaan",
    "Kunci Jawaban & Rubrik", "Tanggal Dibuat"
  ]);

  var now = new Date().toLocaleString("id-ID");
  var rows = questions.map(function (q) {
    return [
      q.id || "",
      q.grade || "10",
      q.type || "Formatif",
      q.level || "HOTS",
      q.topic || "",
      q.stimulus || "",
      q.question || "",
      q.answer || "",
      now
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }
  formatSheetHeader(sheet, "#7c3aed");
}

/**
 * Helper Update State Cache untuk Presensi
 */
function updateStateCacheAttendance(ss, classId, date, records) {
  try {
    var stateSheet = ss.getSheetByName(SHEET_NAMES.STATE);
    var currentJSON = stateSheet.getRange("A1").getValue();
    if (!currentJSON) return;

    var appData = JSON.parse(currentJSON);
    if (!appData.attendanceDatabase) appData.attendanceDatabase = {};
    if (!appData.attendanceDatabase[classId]) appData.attendanceDatabase[classId] = {};
    if (!appData.attendanceDatabase[classId][date]) appData.attendanceDatabase[classId][date] = {};

    records.forEach(function (rec) {
      appData.attendanceDatabase[classId][date][rec.nis] = {
        status: rec.status,
        note: rec.note || ""
      };
    });

    stateSheet.getRange("A1").setValue(JSON.stringify(appData));
    stateSheet.getRange("A2").setValue("Terakhir Diperbarui: " + new Date().toLocaleString("id-ID"));
  } catch (e) {}
}

/**
 * Helper Update State Cache untuk Siswa
 */
function updateStateCacheStudents(ss, classId, students) {
  try {
    var stateSheet = ss.getSheetByName(SHEET_NAMES.STATE);
    var currentJSON = stateSheet.getRange("A1").getValue();
    if (!currentJSON) return;

    var appData = JSON.parse(currentJSON);
    if (!appData.studentsDatabase) appData.studentsDatabase = {};
    appData.studentsDatabase[classId] = students;

    stateSheet.getRange("A1").setValue(JSON.stringify(appData));
    stateSheet.getRange("A2").setValue("Terakhir Diperbarui: " + new Date().toLocaleString("id-ID"));
  } catch (e) {}
}

/**
 * Ekstraksi Data dari Tabel Sheet jika _APP_STATE kosong
 */
function extractDataFromTables(ss) {
  var classesMeta = [];
  var studentsDatabase = {};
  var attendanceDatabase = {};
  var customQuestions = [];

  // 1. Ekstrak Kelas
  var kSheet = ss.getSheetByName(SHEET_NAMES.KELAS);
  if (kSheet && kSheet.getLastRow() > 1) {
    var kData = kSheet.getRange(2, 1, kSheet.getLastRow() - 1, 3).getValues();
    kData.forEach(function (row) {
      if (row[0]) {
        var id = String(row[0]);
        var name = String(row[1] || id);
        var gradeMatch = String(row[2]).match(/\d+/);
        var grade = gradeMatch ? gradeMatch[0] : "10";
        classesMeta.push({ id: id, grade: grade, name: name });
        studentsDatabase[id] = [];
      }
    });
  }

  // 2. Ekstrak Siswa
  var sSheet = ss.getSheetByName(SHEET_NAMES.SISWA);
  if (sSheet && sSheet.getLastRow() > 1) {
    var sData = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 6).getValues();
    sData.forEach(function (row) {
      var clsId = String(row[0]);
      if (clsId) {
        if (!studentsDatabase[clsId]) studentsDatabase[clsId] = [];
        studentsDatabase[clsId].push({
          nis: String(row[2]).replace(/^'/, ""),
          nisn: String(row[3]).replace(/^'/, ""),
          name: String(row[4]),
          gender: String(row[5] || "L")
        });
      }
    });
  }

  // 3. Ekstrak Presensi
  var pSheet = ss.getSheetByName(SHEET_NAMES.PRESENSI);
  if (pSheet && pSheet.getLastRow() > 1) {
    var pData = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 10).getValues();
    pData.forEach(function (row) {
      var date = formatDateToString(row[1]);
      var clsId = String(row[2]);
      var nis = String(row[4]).replace(/^'/, "");
      var status = String(row[8] || "H");
      var note = String(row[9] || "");

      if (clsId && date && nis) {
        if (!attendanceDatabase[clsId]) attendanceDatabase[clsId] = {};
        if (!attendanceDatabase[clsId][date]) attendanceDatabase[clsId][date] = {};
        attendanceDatabase[clsId][date][nis] = { status: status, note: note };
      }
    });
  }

  // 4. Ekstrak Soal
  var bSheet = ss.getSheetByName(SHEET_NAMES.SOAL);
  if (bSheet && bSheet.getLastRow() > 1) {
    var bData = bSheet.getRange(2, 1, bSheet.getLastRow() - 1, 8).getValues();
    bData.forEach(function (row) {
      if (row[0] && row[6]) {
        customQuestions.push({
          id: String(row[0]),
          grade: String(row[1] || "10"),
          type: String(row[2] || "Formatif"),
          level: String(row[3] || "HOTS"),
          topic: String(row[4] || ""),
          stimulus: String(row[5] || ""),
          question: String(row[6]),
          answer: String(row[7] || "")
        });
      }
    });
  }

  return {
    classesMeta: classesMeta,
    studentsDatabase: studentsDatabase,
    attendanceDatabase: attendanceDatabase,
    customQuestions: customQuestions
  };
}

/**
 * Format tanggal ke format YYYY-MM-DD
 */
function formatDateToString(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd");
  }
  return String(val).trim();
}

/**
 * Response Helper dengan Header JSON & CORS
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
