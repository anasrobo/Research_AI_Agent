import React, { useEffect, useMemo, useState } from 'react'
import { ThemeProvider, createTheme, CssBaseline, Container, Typography, Box, Stack, Link as MLink, Tooltip, useMediaQuery, LinearProgress, Alert, Chip, Card, CardContent, List, ListItem, ListItemText, Divider, Button } from '@mui/material'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { getTask, startResearch, TaskData, runOneShotResearch, OneShotResponse } from './api'
import Progress from './components/Progress'
import ResultCard from './components/ResultCard'
// Removed direct ResearchStep usage in favor of styled accordions
import {ResearchHeader} from './components/ResearchHeader'
import QueryInput from './components/QueryInput'
import StepTabs from './components/StepTabs'
import ResearchAccordion from './components/ResearchAccordion'
import BriefingCard from './components/BriefingCard'
import jsPDF from 'jspdf'

export default function App() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [mode, setMode] = useState<'light' | 'dark'>(prefersDark ? 'dark' : 'light')
  useEffect(() => { setMode(prefersDark ? 'dark' : 'light') }, [prefersDark])

  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: '#1976D2' },
      secondary: { main: '#4CAF50' },
      background: {
        default: mode === 'dark' ? '#0e1117' : '#FFFFFF',
        paper: mode === 'dark' ? '#141823' : '#FFFFFF',
      },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
    },
  }), [mode])

  const [query, setQuery] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [task, setTask] = useState<TaskData | null>(null)
  const [oneShot, setOneShot] = useState<OneShotResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReading, setShowReading] = useState(false)
  const stepOrder = ['planning','searching','reading','verifying','reflecting','briefing'] as const
  const [tabIndex, setTabIndex] = useState(0)

  // Optional: keep compatibility for long-running polling endpoint if used.
  useEffect(() => {
    if (!taskId) return
    const iv = setInterval(async () => {
      try {
        const t = await getTask(taskId)
        setTask(t)
        if (t.status !== 'running') {
          clearInterval(iv)
        }
        
      } catch (e) {
        clearInterval(iv)
      }
    }, 1200)
    return () => clearInterval(iv)
  }, [taskId])

  const currentStep = useMemo(() => {
    // Determine current step from one-shot or task
    const order = ['planning', 'searching', 'reading', 'verifying', 'reflecting', 'briefing'] as const
    const has = (k: string) => {
      if (oneShot) {
        const map: Record<string, any> = {
          planning: oneShot.Planning,
          searching: oneShot.Searching,
          reading: oneShot.Reading,
          verifying: oneShot.Verifying,
          reflecting: oneShot.Reflecting,
          briefing: oneShot.Briefing,
        }
        return !!map[k]
      }
      if (task) {
        if (task.brief) return k === 'briefing'
        // fall back to existing behavior
        // @ts-ignore
        return !!task.steps?.[k]
      }
      return false
    }
    for (const s of order) {
      if (!has(s)) return s
    }
    return 'briefing'
  }, [oneShot, task])

  useEffect(() => {
    const idx = stepOrder.indexOf(currentStep as any)
    if (idx >= 0) setTabIndex(idx)
  }, [currentStep])

  const run = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setTask(null)
    setTaskId(null)
    setOneShot(null)
    setShowReading(false)
    try {
      const data = await runOneShotResearch(query, 'http://localhost:8000/api/endpoint')
      setOneShot(data)
      setLoading(false)
    } catch (e: any) {
      // Fallback to long-running /research when one-shot is not available
      const status = e?.response?.status
      if (status === 404) {
        try {
          const id = await startResearch(query)
          setTaskId(id)
          // leave loading on false; progress will reflect polling status
        } catch (e2: any) {
          setError(e2?.response?.data?.detail || e2?.message || 'Request failed')
        } finally {
          setLoading(false)
        }
      } else {
        setError(e?.response?.data?.detail || e?.message || 'Request failed')
        setLoading(false)
      }
    }
  }

  const getHost = (u: string) => {
    try {
      const url = new URL(u.startsWith('http') ? u : 'https://' + u.replace(/^\/+/, ''))
      return url.hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  }

  const parseSources = (s: string): { title: string; url: string; host: string }[] => {
    const items: { title: string; url: string; host: string }[] = []
    if (!s) return items
    const lines = s.split(/\n+/)
    for (const line of lines) {
      const m = line.match(/^-\s*(.*?)\s*\((https?:[^\s)]+)\)/i)
      if (m) {
        const title = m[1]
        const url = m[2]
        items.push({ title, url, host: getHost(url) })
      }
    }
    return items
  }

  const cleanParagraph = (s?: string): string => {
    let t = (s || '').trim()
    if (!t) return ''
    // Drop internal headings like **Introduction**, ## Risks, etc.
    t = t.replace(/^\s*(\*\*|##?)\s*(introduction|key findings|risks|conclusion)\s*(\*\*|:+)?\s*$/gim, '')
    // Remove repeated heading markers embedded within
    t = t.replace(/^(\*\*[^*]+\*\*\s*:?)\s*$/gim, '')
    // Collapse multiple newlines
    t = t.replace(/\n{3,}/g, '\n\n')
    return t.trim()
  }

  // Normalize content for Reading section: keep paragraph breaks but unwrap hard line breaks
  const normalizeContent = (s?: string): string => {
    let t = (s || '').replace(/\r/g, '')
    if (!t) return ''
    // Protect paragraph breaks by temporarily marking double newlines
    t = t.replace(/\n{2,}/g, '\u0000')
    // Convert any remaining single newlines into spaces (unwrap forced breaks)
    t = t.replace(/\n/g, ' ')
    // Collapse repeated whitespace
    t = t.replace(/[\t ]{2,}/g, ' ')
    // Restore paragraph breaks
    t = t.replace(/\u0000/g, '\n\n')
    return t.trim()
  }

  type Bullet = { title?: string; text: string }
  const extractBullets = (s?: string): Bullet[] => {
    const out: Bullet[] = []
    const seen = new Set<string>()
    if (!s) return out
    const lines = s.split(/\n+/)
    for (let line of lines) {
      const m = line.match(/^\s*[-*]\s+(.*)$/)
      if (!m) continue
      let body = m[1].trim()
      if (!body) continue
      // Pattern: **Title:** content
      const titled = body.match(/^\*\*([^*]+)\*\*\s*:\s*(.*)$/)
      let b: Bullet
      if (titled) {
        b = { title: titled[1].trim(), text: titled[2].trim() }
      } else {
        b = { text: body }
      }
      const key = (b.title ? b.title + '::' : '') + b.text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(b)
    }
    return out
  }

  const downloadPdf = () => {
    const brief = oneShot?.Briefing || task?.brief
    if (!brief) return
    const doc = new jsPDF()
    let y = 10
    const addSection = (title: string, text: string) => {
      doc.setFontSize(14)
      doc.text(title, 10, y)
      y += 6
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(text || '', 190)
      for (const line of lines) {
        if (y > 280) { doc.addPage(); y = 10 }
        doc.text(line, 10, y)
        y += 6
      }
      y += 4
    }
    addSection('Introduction', brief.Introduction)
    addSection('Key Findings', brief['Key Findings'])
    addSection('Risks', brief.Risks)
    addSection('Conclusion', brief.Conclusion)
    addSection('Sources', brief.Sources)
    doc.save('research-brief.pdf')
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ResearchHeader mode={mode} onToggleMode={() => setMode(m => m === 'dark' ? 'light' : 'dark')} />

      {loading && <LinearProgress color="primary" />}

      <Container maxWidth="lg" sx={{ py: 2 }}>
        {/* Place the main query input directly under the header */}
        <Box sx={{ mb: 2 }}>
          <QueryInput query={query} onChange={setQuery} onRun={run} loading={loading} />
        </Box>
        <Box sx={{
          p: { xs: 2, md: 3 },
          borderRadius: 3,
          bgcolor: (t) => t.palette.mode==='dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: (t) => `1px solid ${t.palette.mode==='dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)'}`,
          boxShadow: (t) => t.palette.mode==='dark' ? '0 10px 30px rgba(0,0,0,0.35)' : t.shadows[2],
        }}>
          <StepTabs value={tabIndex} onChange={setTabIndex} completed={!!(oneShot || task?.brief)} />

          <Box sx={{ mt: 2 }}>
            <Progress current={currentStep} status={task ? task.status : (oneShot ? 'completed' : (loading ? 'running' : 'idle'))} />
          </Box>
        </Box>

        {error && (
          <Box role="alert" sx={{ mt: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {/* Steps */}
        <Stack spacing={2} sx={{ mt: 3 }}>
          {/* Planning */}
          {(oneShot?.Planning || task?.steps.planning) && (
            <ResearchAccordion
              header={<Typography variant="h6">Planning</Typography>}
              defaultExpanded
            >
              <List dense>
                {Array.isArray(oneShot?.Planning?.steps)
                  ? oneShot!.Planning.steps.map((s: string, i: number) => (
                      <ListItem key={i} sx={{ py: 0.5 }}>
                        <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={s} />
                      </ListItem>
                    ))
                  : (task?.steps.planning?.steps || []).map((s: string, i: number) => (
                      <ListItem key={i} sx={{ py: 0.5 }}>
                        <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={s} />
                      </ListItem>
                    ))}
              </List>
            </ResearchAccordion>
          )}

          {/* Searching */}
          {(oneShot?.Searching || task?.steps.searching) && (
            <ResearchAccordion
              header={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6">Searching</Typography>
                  <Chip size="small" color="success" label={(oneShot?.Searching || task?.steps.searching)?.length || 0} />
                </Stack>
              }
            >
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
                gap: 2,
              }}>
                {(oneShot?.Searching || task?.steps.searching || []).map((s: any, i: number) => (
                  <Card key={i} variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Typography variant="subtitle2" noWrap>{s.title}</Typography>
                        <Chip size="small" label={getHost(s.url)} />
                      </Stack>
                      {s.url && (
                        <MLink href={s.url} target="_blank" rel="noreferrer" underline="hover" sx={{ wordBreak: 'break-all', display:'block', mt: 1 }}>
                          {s.url}
                        </MLink>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </ResearchAccordion>
          )}

          {/* Reading */}
          {(oneShot?.Reading || task?.steps.reading) && (
            <ResearchAccordion
              header={<Typography variant="h6">Reading <Typography component="span" variant="caption" color="text.secondary">Top documents</Typography></Typography>}
              defaultExpanded={showReading}
            >
              <Stack spacing={2}>
                <Button size="small" variant="text" sx={{ alignSelf: 'flex-end' }}>Skip to Content</Button>
                <List>
                  {(oneShot?.Reading || task?.steps.reading || []).slice(0, 5).map((r: any, i: number) => (
                    <React.Fragment key={i}>
                      <ListItem secondaryAction={r.url ? <Button size="small" onClick={() => window.open(r.url, '_blank','noreferrer')}>Open</Button> : null}>
                        <ListItemText
                          primary={<Typography variant="subtitle2" noWrap>{r.title || `Document ${i+1}`}</Typography>}
                          secondary={r.url ? <MLink href={r.url} target="_blank" rel="noreferrer" underline="hover">{r.url}</MLink> : null}
                        />
                      </ListItem>
                      <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, mb: 2 }}>
                        <Typography
                          variant="body2"
                          sx={{ whiteSpace: 'pre-line', wordBreak: 'break-word', textAlign: 'justify', hyphens: 'auto' as any }}
                        >
                          {normalizeContent(r.content || r.error)}
                        </Typography>
                      </Box>
                      <Divider />
                    </React.Fragment>
                  ))}
                </List>
              </Stack>
            </ResearchAccordion>
          )}

          {/* Verifying */}
          {(oneShot?.Verifying || task?.steps.verifying) && (
            <ResearchAccordion header={<Typography variant="h6">Verifying</Typography>}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                <CheckCircleIcon fontSize="small" color="success" sx={{ mr: 1, verticalAlign: 'middle' }} />
                {(oneShot as any)?.Verifying?.analysis || task?.steps.verifying?.analysis}
              </Typography>
            </ResearchAccordion>
          )}

          {/* Reflecting */}
          {(oneShot?.Reflecting || task?.steps.reflecting) && (
            <ResearchAccordion header={<Typography variant="h6">Reflecting</Typography>}>
              <Typography variant="body2">
                <strong>Need more sources:</strong> {String((oneShot as any)?.Reflecting?.need_more ?? task?.steps.reflecting?.need_more ?? false)}
              </Typography>
              {((oneShot as any)?.Reflecting?.refined_query || task?.steps.reflecting?.refined_query) && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Refined query:</strong> {(oneShot as any)?.Reflecting?.refined_query || task?.steps.reflecting?.refined_query}
                </Typography>
              )}
            </ResearchAccordion>
          )}

          {/* Briefing / Results */}
          {(oneShot?.Briefing || task?.brief) && (
            <Stack spacing={2}>
              <BriefingCard
                introduction={cleanParagraph((oneShot as any)?.Briefing?.Introduction || task?.brief?.Introduction)}
                keyFindings={extractBullets(((oneShot as any)?.Briefing?.['Key Findings']) || task?.brief?.['Key Findings'])}
                risks={extractBullets(((oneShot as any)?.Briefing?.Risks) || task?.brief?.Risks)}
                conclusion={cleanParagraph(((oneShot as any)?.Briefing?.Conclusion) || task?.brief?.Conclusion)}
                sources={parseSources(((oneShot as any)?.Briefing?.Sources) || task?.brief?.Sources)}
              />

              <Box textAlign="right">
                <Tooltip title="Export briefing as PDF">
                  <Button variant="outlined" color="secondary" startIcon={<FileDownloadIcon />} onClick={downloadPdf} aria-label="Download PDF">
                    Download PDF
                  </Button>
                </Tooltip>
              </Box>
            </Stack>
          )}

          {task?.status === 'error' && (
            <ResultCard title="Error">
              <Typography color="error">{task.error}</Typography>
            </ResultCard>
          )}
        </Stack>
      </Container>
    </ThemeProvider>
  )
}
