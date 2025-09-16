import React from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Chip, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

export type ResearchStepProps = {
  title: string
  subtitle?: string
  countBadge?: number
  defaultExpanded?: boolean
  children: React.ReactNode
}

export default function ResearchStep({ title, subtitle, countBadge, defaultExpanded, children }: ResearchStepProps) {
  return (
    <Accordion defaultExpanded={defaultExpanded} sx={{ borderRadius: 2 }} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={`${title}-content`} id={`${title}-header`}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ width: '100%', justifyContent: 'space-between' }}>
          <Stack direction="column" spacing={0} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{subtitle}</Typography>
            )}
          </Stack>
          {typeof countBadge === 'number' && (
            <Chip size="small" color="secondary" label={countBadge} aria-label={`${title} items count`} />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {children}
      </AccordionDetails>
    </Accordion>
  )
}
