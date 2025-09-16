import React from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Paper } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

export type ResearchAccordionProps = {
  header: React.ReactNode
  defaultExpanded?: boolean
  children: React.ReactNode
}

export default React.memo(function ResearchAccordion({ header, defaultExpanded, children }: ResearchAccordionProps) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters sx={{
      borderRadius: 2,
      backgroundImage: (t) => t.palette.mode === 'dark' ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))' : 'linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.01))',
      '&:before': { display: 'none' },
      overflow: 'hidden',
      transition: 'box-shadow 200ms ease',
      '&:hover': { boxShadow: (t) => t.shadows[4] },
    }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        {header}
      </AccordionSummary>
      <AccordionDetails>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, maxHeight: 420, overflow: 'auto' }}>
          {children}
        </Paper>
      </AccordionDetails>
    </Accordion>
  )
})
