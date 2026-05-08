'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type NodeProps,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, Workflow, WorkflowNodeData, WorkflowNodeType, WorkflowRun } from '@/lib/api'

// ─── Node colours ─────────────────────────────────────────────────────────────

const NODE_CONFIG: Record<WorkflowNodeType, { color: string; bg: string; label: string }> = {
  trigger:      { color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  label: 'Trigger' },
  check:        { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Check' },
  action:       { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   label: 'Action' },
  notify:       { color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  label: 'Notify' },
  decision:     { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  label: 'Decision' },
  memory_read:  { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   label: 'Memory Read' },
  memory_write: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   label: 'Memory Write' },
}

// ─── Custom node component ─────────────────────────────────────────────────────

function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData & { nodeType: WorkflowNodeType }
  const cfg = NODE_CONFIG[nodeData.nodeType] ?? NODE_CONFIG.action

  return (
    <div
      style={{
        backgroundColor: cfg.bg,
        border: `1.5px solid ${selected ? cfg.color : cfg.color + '60'}`,
        borderRadius: '12px',
        padding: '10px 14px',
        minWidth: '180px',
        maxWidth: '240px',
        boxShadow: selected ? `0 0 0 2px ${cfg.color}40` : 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: cfg.color, border: 'none', width: 8, height: 8 }}
      />
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ backgroundColor: cfg.color + '25', color: cfg.color }}
        >
          {cfg.label}
        </span>
      </div>
      <p className="text-sm font-medium leading-tight" style={{ color: '#f0f0f0' }}>
        {nodeData.label}
      </p>
      {nodeData.capability && (
        <p className="text-xs mt-1" style={{ color: '#888' }}>
          {nodeData.capability}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: cfg.color, border: 'none', width: 8, height: 8 }}
      />
    </div>
  )
}

const nodeTypes = {
  trigger: WorkflowNode,
  check: WorkflowNode,
  action: WorkflowNode,
  notify: WorkflowNode,
  decision: WorkflowNode,
  memory_read: WorkflowNode,
  memory_write: WorkflowNode,
}

// ─── Node editor sidebar ──────────────────────────────────────────────────────

function NodeEditor({
  node,
  onUpdate,
  onClose,
}: {
  node: Node
  onUpdate: (id: string, data: Partial<WorkflowNodeData>) => void
  onClose: () => void
}) {
  const nodeData = node.data as WorkflowNodeData & { nodeType: WorkflowNodeType }
  const [label, setLabel] = useState(nodeData.label)
  const [capability, setCapability] = useState(nodeData.capability ?? '')

  function handleSave() {
    onUpdate(node.id, { label, capability: capability || undefined })
    onClose()
  }

  return (
    <div
      className="absolute top-4 right-4 z-10 w-72 rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#111',
        border: '0.5px solid #2a2a2a',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '0.5px solid #2a2a2a' }}
      >
        <span className="text-sm font-medium" style={{ color: '#f0f0f0' }}>
          Edit Node
        </span>
        <button
          onClick={onClose}
          className="text-sm transition-colors"
          style={{ color: '#555' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#f0f0f0')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
        >
          ✕
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#555' }}>Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: '#1a1a1a',
              border: '0.5px solid #2a2a2a',
              color: '#f0f0f0',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#3a3a3a')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
          />
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#555' }}>
            Capability <span style={{ color: '#444' }}>(optional)</span>
          </label>
          <input
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            placeholder="e.g. calendar.create_event"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: '#1a1a1a',
              border: '0.5px solid #2a2a2a',
              color: '#f0f0f0',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#3a3a3a')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
          />
        </div>
        <button
          onClick={handleSave}
          className="w-full py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ backgroundColor: '#6366f1', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4f52d4')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#6366f1')}
        >
          Save
        </button>
      </div>
    </div>
  )
}

// ─── Canvas inner (needs ReactFlow context) ───────────────────────────────────

function CanvasInner({ workflow }: { workflow: Workflow }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [running, setRunning] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)

  // Convert DB nodes to React Flow format
  const initialNodes: Node[] = workflow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, nodeType: n.type },
  }))

  const initialEdges: Edge[] = workflow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    style: { stroke: '#3a3a3a', strokeWidth: 2 },
    labelStyle: { fill: '#888', fontSize: 11 },
    labelBgStyle: { fill: '#111' },
  }))

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            style: { stroke: '#3a3a3a', strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [setEdges],
  )

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNode(node)
  }

  function handlePaneClick() {
    setSelectedNode(null)
  }

  function handleNodeUpdate(id: string, data: Partial<WorkflowNodeData>) {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    )
  }

  async function handleRun() {
    setRunning(true)
    try {
      await api.workflows.run(workflow.id)
    } finally {
      setRunning(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Convert back to DB format
      const dbNodes = nodes.map((n) => {
        const { nodeType, ...rest } = n.data as WorkflowNodeData & { nodeType: WorkflowNodeType }
        return {
          id: n.id,
          type: nodeType,
          position: n.position,
          data: rest,
        }
      })
      const dbEdges = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      }))
      await api.workflows.update(workflow.id, { nodes: dbNodes as any, edges: dbEdges })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        style={{ backgroundColor: '#0a0a0a' }}
        defaultEdgeOptions={{
          style: { stroke: '#3a3a3a', strokeWidth: 2 },
        }}
      >
        <Background color="#1a1a1a" gap={24} size={1} />
        <Controls
          style={{
            backgroundColor: '#111',
            border: '0.5px solid #2a2a2a',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        />
      </ReactFlow>

      {/* Top bar */}
      <div
        className="absolute top-4 left-4 flex items-center gap-2 z-10"
      >
        <button
          onClick={() => router.push('/workflows')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
          style={{
            backgroundColor: '#111',
            border: '0.5px solid #2a2a2a',
            color: '#888',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#f0f0f0')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
        >
          ← Back
        </button>
        <div
          className="px-3 py-2 rounded-xl"
          style={{ backgroundColor: '#111', border: '0.5px solid #2a2a2a' }}
        >
          <span className="text-sm font-medium" style={{ color: '#f0f0f0' }}>
            {workflow.name}
          </span>
        </div>
      </div>

      {/* Save + Run buttons */}
      <div
        className="absolute top-4 flex items-center gap-2 z-10"
        style={{ right: selectedNode ? '300px' : '16px' }}
      >
        <button
          onClick={handleRun}
          disabled={running}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          style={{
            backgroundColor: running ? '#1a1a1a' : '#111',
            border: '0.5px solid #2a2a2a',
            color: running ? '#f59e0b' : '#888',
          }}
          onMouseEnter={(e) => { if (!running) e.currentTarget.style.color = '#f0f0f0' }}
          onMouseLeave={(e) => { if (!running) e.currentTarget.style.color = '#888' }}
        >
          {running ? (
            <>
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
              Running…
            </>
          ) : (
            <>▶ Run</>
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: saved ? '#22c55e' : '#6366f1', color: '#fff' }}
          onMouseEnter={(e) => { if (!saved) e.currentTarget.style.backgroundColor = '#4f52d4' }}
          onMouseLeave={(e) => { if (!saved) e.currentTarget.style.backgroundColor = '#6366f1' }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* Node editor */}
      {selectedNode && (
        <NodeEditor
          node={selectedNode}
          onUpdate={handleNodeUpdate}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowCanvasPage() {
  const params = useParams()
  const id = params.id as string
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    api.workflows.get(id)
      .then(setWorkflow)
      .catch(() => setNotFound(true))
  }, [id])

  if (notFound) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Workflow not found.</p>
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: 'var(--text-tertiary)', animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <CanvasInner workflow={workflow} />
    </ReactFlowProvider>
  )
}
