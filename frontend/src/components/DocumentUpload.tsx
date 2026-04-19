'use client'

import { useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

export type UploadedDocument = {
  documentId: string
  fileName: string
  fileUrl: string
  storagePath: string
  mimeType: string
}

type UploadState = {
  id: string
  name: string
  status: 'queued' | 'uploading' | 'done' | 'error'
  message?: string
  document?: UploadedDocument
}

interface DocumentUploadProps {
  onUploaded?: (document: UploadedDocument) => void
}

function isAllowedFile(file: File): boolean {
  return file.type === 'application/pdf' || file.type.startsWith('image/')
}

function makeStoragePath(file: File, documentId: string): string {
  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `documents/${documentId}/${safeName || 'file'}`
}

function extractDocumentId(row: Record<string, any> | null | undefined, fallback: string): string {
  if (!row || typeof row !== 'object') return fallback
  return String(row.document_id ?? row.documentId ?? row.id ?? fallback)
}

async function insertDocumentRow(file: File, storagePath: string, fileUrl: string, documentId: string) {
  const payloadVariants: Record<string, any>[] = [
    {
      document_id: documentId,
      name: file.name,
      url: fileUrl,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
    },
    {
      id: documentId,
      name: file.name,
      url: fileUrl,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
    },
    {
      name: file.name,
      url: fileUrl,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
    },
    {
      file_name: file.name,
      file_url: fileUrl,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
    },
  ]

  let lastError: string | null = null

  for (const payload of payloadVariants) {
    const { data, error } = await supabase
      .from('documents')
      .insert(payload)
      .select('*')
      .maybeSingle()

    if (!error) {
      const row = data as Record<string, any> | null | undefined
      return {
        documentId: extractDocumentId(row, documentId),
        row,
      }
    }

    lastError = error.message
  }

  throw new Error(lastError || 'Failed to insert document row')
}

export function DocumentUpload({ onUploaded }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState<UploadState[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptedTypes = useMemo(() => 'application/pdf,image/*', [])

  async function uploadFile(file: File) {
    if (!isAllowedFile(file)) {
      setUploads((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          status: 'error',
          message: 'Only PDFs and images are allowed.',
        },
        ...prev,
      ])
      return
    }

    const uploadId = crypto.randomUUID()
    const storagePath = makeStoragePath(file, uploadId)
    const fileName = file.name

    setUploads((prev) => [
      { id: uploadId, name: fileName, status: 'uploading', message: 'Uploading…' },
      ...prev,
    ])

    try {
      const { error: storageError } = await supabase.storage
        .from('user_docs')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        })

      if (storageError) {
        throw storageError
      }

      const { data: publicData } = supabase.storage.from('user_docs').getPublicUrl(storagePath)
      const fileUrl = publicData.publicUrl

      if (!fileUrl) {
        throw new Error('Could not create a public URL for the uploaded file.')
      }

      const inserted = await insertDocumentRow(file, storagePath, fileUrl, uploadId)
      const result: UploadedDocument = {
        documentId: inserted.documentId,
        fileName,
        fileUrl,
        storagePath,
        mimeType: file.type,
      }

      setUploads((prev) =>
        prev.map((item) =>
          item.id === uploadId
            ? { ...item, status: 'done', message: 'Uploaded', document: result }
            : item
        )
      )
      onUploaded?.(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.'
      setUploads((prev) =>
        prev.map((item) =>
          item.id === uploadId
            ? { ...item, status: 'error', message }
            : item
        )
      )
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    for (const file of list) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(file)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-white font-semibold text-sm">Upload documents</h3>
          <p className="text-white/35 text-xs mt-1">Drag and drop PDFs or images. Files go to Supabase Storage and are saved in <span className="text-white/55">documents</span>.</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          Choose files
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Document upload dropzone"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
        onDrop={async (e) => {
          e.preventDefault()
          setIsDragging(false)
          if (e.dataTransfer.files?.length) {
            await handleFiles(e.dataTransfer.files)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={[
          'rounded-2xl border border-dashed px-5 py-8 text-center transition-all cursor-pointer outline-none',
          isDragging ? 'border-emerald-300 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(110,231,183,0.2)]' : 'border-white/10 bg-black/10 hover:border-white/20 hover:bg-black/15',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes}
          multiple
          className="hidden"
          onChange={async (e) => {
            if (e.target.files?.length) {
              await handleFiles(e.target.files)
              e.target.value = ''
            }
          }}
        />
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white/60">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 16.5A3.5 3.5 0 0 1 7.5 13H8a4 4 0 0 1 8 0h.5A3.5 3.5 0 0 1 20 16.5 3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5Z" />
          </svg>
        </div>
        <p className="text-sm text-white/75">Drop PDFs or images here</p>
        <p className="mt-1 text-xs text-white/35">PDF, PNG, JPG, JPEG, WEBP, GIF</p>
      </div>

      {uploads.length > 0 && (
        <div className="mt-4 space-y-3">
          {uploads.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{item.name}</p>
                <p className={`text-xs mt-1 ${item.status === 'error' ? 'text-rose-300' : 'text-white/35'}`}>
                  {item.message ?? item.status}
                </p>
                {item.document?.documentId ? (
                  <p className="text-[11px] mt-2 text-emerald-300 break-all">
                    document_id: {item.document.documentId}
                  </p>
                ) : null}
              </div>
              <div className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${
                item.status === 'done'
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                  : item.status === 'error'
                    ? 'border-rose-400/25 bg-rose-400/10 text-rose-200'
                    : 'border-white/10 bg-white/5 text-white/45'
              }`}>
                {item.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
