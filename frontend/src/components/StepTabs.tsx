import React from 'react'
import { Tabs, Tab, Chip, Box } from '@mui/material'

const labels = ['Planning','Searching','Reading','Verifying','Reflecting','Briefing']

export type StepTabsProps = {
  value: number
  onChange: (index: number) => void
  completed?: boolean
}

export default React.memo(function StepTabs({ value, onChange, completed }: StepTabsProps) {
  return (
    <Box sx={{ mt: 2, borderBottom: '1px solid', borderColor: 'rgba(255,255,255,0.08)' }}>
      <Tabs
        value={value}
        onChange={(_, v) => onChange(v)}
        variant="scrollable"
        scrollButtons
        allowScrollButtonsMobile
        TabIndicatorProps={{ style: { display: 'none' } }}
        sx={{
          '& .MuiTab-root': {
            textTransform: 'uppercase',
            fontWeight: 700,
            borderRadius: 999,
            minHeight: 38,
            px: 2,
            mr: 1,
            color: 'text.secondary',
          },
          '& .Mui-selected': {
            color: '#16e175',
            backgroundColor: 'rgba(22,225,117,0.08)',
            boxShadow: '0 0 16px rgba(22,225,117,0.35) inset',
          },
        }}
      >
        {labels.map((l) => (
          <Tab key={l} label={l} />
        ))}
        <Box sx={{ ml: 'auto', mr: 1, display: 'flex', alignItems: 'center' }}>
          {completed && <Chip size="small" color="success" label="completed" />}
        </Box>
      </Tabs>
    </Box>
  )
})
