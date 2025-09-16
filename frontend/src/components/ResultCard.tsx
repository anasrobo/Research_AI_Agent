import React from 'react'
import { Card, CardHeader, CardContent } from '@mui/material'

export default function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <CardHeader titleTypographyProps={{ variant: 'h6' }} title={title} sx={{ pb: 0 }} />
      <CardContent sx={{ pt: 1 }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</div>
      </CardContent>
    </Card>
  )
}
