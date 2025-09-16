import React from 'react'
import { IconButton, Tooltip } from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'

export type ThemeToggleProps = {
  mode: 'light' | 'dark'
  onToggle: () => void
}

export default React.memo(function ThemeToggle({ mode, onToggle }: ThemeToggleProps) {
  return (
    <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton color="inherit" aria-label="toggle dark mode" onClick={onToggle} size="large">
        {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  )
})
