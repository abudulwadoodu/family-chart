import { describe, it, expect } from 'vitest';
import { isAcceptedFile, kindForFile, createPendingFileEntry } from './mediaUpload.js';

function file(name, type) {
  return { name, type };
}

describe('kindForFile', () => {
  it('maps image/* to photo and video/* to video, everything else to document', () => {
    expect(kindForFile(file('a.jpg', 'image/jpeg'))).toBe('photo');
    expect(kindForFile(file('a.mp4', 'video/mp4'))).toBe('video');
    expect(kindForFile(file('a.pdf', 'application/pdf'))).toBe('document');
  });
});

describe('isAcceptedFile', () => {
  it('accepts images and videos by MIME type', () => {
    expect(isAcceptedFile(file('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isAcceptedFile(file('a.mp4', 'video/mp4'))).toBe(true);
  });

  it('accepts pdf/doc/docx by MIME type', () => {
    expect(isAcceptedFile(file('a.pdf', 'application/pdf'))).toBe(true);
    expect(isAcceptedFile(file('a.doc', 'application/msword'))).toBe(true);
    expect(isAcceptedFile(file('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe(true);
  });

  it('rejects unsupported types like executables or archives', () => {
    expect(isAcceptedFile(file('a.exe', 'application/x-msdownload'))).toBe(false);
    expect(isAcceptedFile(file('a.zip', 'application/zip'))).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(isAcceptedFile(null)).toBe(false);
    expect(isAcceptedFile(undefined)).toBe(false);
  });
});

describe('createPendingFileEntry', () => {
  it('gives each entry a unique, stable id independent of the File object', () => {
    const a = createPendingFileEntry(file('a.jpg', 'image/jpeg'));
    const b = createPendingFileEntry(file('a.jpg', 'image/jpeg'));
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe('pending');
  });

  it('id survives the mediaLibraryPanel.js/timelinePanel.js "mark uploading" pattern of replacing the entry object', () => {
    // Regression test: both panels track the pending-upload queue by
    // reassigning `pageState.pendingFiles`/`local.pendingFiles` to a *new*
    // array of *new* entry objects (`{ ...entry, status: 'uploading' }`)
    // rather than mutating in place. Filtering/removing entries by object
    // identity (`e !== entry`) breaks the moment that reassignment happens,
    // since `entry` captured before the reassignment can never `===`
    // anything in the new array - the "Uploading N files" section never
    // empties out even after every upload succeeds. Filtering by `.id`
    // (stamped once at creation and copied through the spread) doesn't have
    // that problem.
    let pendingFiles = [createPendingFileEntry(file('a.jpg', 'image/jpeg')), createPendingFileEntry(file('b.jpg', 'image/jpeg'))];
    const toUpload = pendingFiles.filter((entry) => entry.status !== 'uploading');

    // Simulate the "mark as uploading" step, which replaces every entry
    // object in the array.
    const uploadingIds = new Set(toUpload.map((entry) => entry.id));
    pendingFiles = pendingFiles.map((entry) => (uploadingIds.has(entry.id) ? { ...entry, status: 'uploading' } : entry));

    // Simulate a successful upload of the first file completing and being
    // removed from the queue by id (what the fixed code does).
    const finishedEntry = toUpload[0];
    pendingFiles = pendingFiles.filter((e) => e.id !== finishedEntry.id);

    expect(pendingFiles).toHaveLength(1);
    expect(pendingFiles[0].file.name).toBe('b.jpg');
  });
});
