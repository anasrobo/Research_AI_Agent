import React from 'react'
import { Card, CardHeader, CardContent, Divider, Typography, Stack, Table, TableHead, TableRow, TableCell, TableBody, Link as MLink } from '@mui/material'

export type Source = { title: string; url: string; host: string }
export type Bullet = { title?: string; text: string }

export type BriefingCardProps = {
  introduction?: string
  keyFindings?: Bullet[]
  risks?: Bullet[]
  conclusion?: string
  sources?: Source[]
}

export default React.memo(function BriefingCard({ introduction, keyFindings, risks, conclusion, sources }: BriefingCardProps) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardHeader titleTypographyProps={{ variant: 'h6' }} title="Briefing" />
      <Divider />
      <CardContent>
        {introduction && (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Introduction</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{introduction}</Typography>
          </>
        )}
        {keyFindings && keyFindings.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Key Findings</Typography>
            <Stack component="ul" sx={{ pl: 2, mb: 2 }}>
              {keyFindings.map((b, i) => (
                <Typography component="li" key={i} variant="body2">
                  {b.title ? <strong>{b.title}: </strong> : null}
                  <span>{b.text}</span>
                </Typography>
              ))}
            </Stack>
          </>
        )}
        {risks && risks.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Risks</Typography>
            <Stack component="ul" sx={{ pl: 2, mb: 2 }}>
              {risks.map((b, i) => (
                <Typography component="li" key={i} variant="body2">
                  {b.title ? <strong>{b.title}: </strong> : null}
                  <span>{b.text}</span>
                </Typography>
              ))}
            </Stack>
          </>
        )}
        {conclusion && (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Conclusion</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{conclusion}</Typography>
          </>
        )}
        {sources && sources.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Sources</Typography>
            <Table size="small" aria-label="Sources table">
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>URL</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sources.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>{s.title}</TableCell>
                    <TableCell>
                      <MLink href={s.url} target="_blank" rel="noreferrer" underline="hover">{s.host}</MLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
})
