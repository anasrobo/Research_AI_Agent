import React from 'react'
import { Box, LinearProgress, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

type Props = { current: string; status: string }

const steps = ['planning', 'searching', 'reading', 'verifying', 'reflecting', 'briefing'] as const

export default function Progress({ current, status }: Props) {
  const currentIndex = Math.max(0, steps.indexOf(current as any))
  const value = (currentIndex / (steps.length - 1)) * 100

  return (
    <Stack spacing={1.5} aria-label="Research progress" role="region">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${steps.length * 2 - 1}, 1fr)`,
          alignItems: 'center',
          gap: 1,
          p: 2,
          borderRadius: 3,
          bgcolor: (t) => t.palette.mode==='dark' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)',
          border: (t) => `1px solid ${t.palette.mode==='dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        {steps.map((s, idx) => (
          <React.Fragment key={s}>
            {/* circle */}
            <Stack gridColumn={`${idx * 2 + 1} / span 1`} alignItems="center" spacing={0.5} sx={{ textTransform: 'uppercase' }}>
              <Box
                aria-label={`${s} ${idx < currentIndex ? 'completed' : idx === currentIndex ? 'in progress' : 'pending'}`}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#16e175',
                  boxShadow:
                    idx <= currentIndex
                      ? '0 0 0 3px rgba(22,225,117,0.15), 0 0 18px rgba(22,225,117,0.4)'
                      : 'inset 0 0 0 2px rgba(255,255,255,0.12)',
                  background:
                    idx <= currentIndex
                      ? 'radial-gradient(closest-side, rgba(22,225,117,0.25), rgba(22,225,117,0.05))'
                      : 'transparent',
                }}
              >
                <CheckCircleIcon fontSize="small" />
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                {s}
              </Typography>
            </Stack>
            {/* line to next */}
            {idx < steps.length - 1 && (
              <Box
                gridColumn={`${idx * 2 + 2} / span 1`}
                sx={{
                  height: 4,
                  borderRadius: 999,
                  bgcolor: idx < currentIndex ? 'success.main' : 'action.disabledBackground',
                  boxShadow: idx < currentIndex ? '0 0 14px rgba(22,225,117,0.45)' : 'none',
                }}
              />
            )}
          </React.Fragment>
        ))}
      </Box>
      <Box sx={{ width: '100%' }}>
        <LinearProgress variant="determinate" value={value} aria-label="Overall progress" />
      </Box>
      <Typography variant="caption" color="text.secondary">{status}</Typography>
    </Stack>
  )
}
