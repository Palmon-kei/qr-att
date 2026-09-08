import * as SQLite from 'expo-sqlite';

export type AttendanceRecord = {
  id: number;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

type EventPayload = {
  v: number;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

let db: SQLite.SQLiteDatabase | null = null;

async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('qr-attendance.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        eventId TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        start TEXT NOT NULL,
        end TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId TEXT NOT NULL,
        eventId TEXT NOT NULL,
        scannedAt TEXT NOT NULL,
        UNIQUE (studentId, eventId)
      );
    `);
  }
  return db;
}

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  let payload: EventPayload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { success: false, message: 'Invalid QR code.' };
  }

  if (payload.v !== 1 || !payload.event) {
    return { success: false, message: 'Not an attendance QR code.' };
  }

  const now = Date.now();
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end && now > end) {
    return { success: false, message: 'Event has already ended.' };
  }

  const database = await getDb();
  const title = payload.title ?? payload.event;

  await database.runAsync(
    'INSERT OR IGNORE INTO events (eventId, title, start, end) VALUES (?, ?, ?, ?)',
    payload.event,
    title,
    payload.start ?? '',
    payload.end ?? ''
  );

  const result = await database.runAsync(
    'INSERT OR IGNORE INTO attendance (studentId, eventId, scannedAt) VALUES (?, ?, ?)',
    studentId,
    payload.event,
    new Date().toISOString()
  );

  if (result.changes === 0) {
    return {
      success: false,
      message: 'Already registered for this event.',
      eventTitle: title,
    };
  }

  return { success: true, message: 'Attendance recorded!', eventTitle: title };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<AttendanceRecord>(
    `SELECT a.id, a.eventId, e.title AS eventTitle, a.scannedAt
     FROM attendance a
     JOIN events e ON e.eventId = a.eventId
     WHERE a.studentId = ?
     ORDER BY a.scannedAt DESC`,
    studentId
  );
  return rows;
}

export async function createEvent(event: Event): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT OR REPLACE INTO events (eventId, title, start, end) VALUES (?, ?, ?, ?)',
    event.eventId,
    event.title,
    event.start,
    event.end
  );
}
