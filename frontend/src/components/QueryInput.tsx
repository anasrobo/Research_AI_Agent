import React from 'react'
import { TextField, Button, Stack, Box } from '@mui/material'

export type QueryInputProps = {
  query: string
  onChange: (v: string) => void
  onRun: () => void
  loading?: boolean
}

export default React.memo(function QueryInput({ query, onChange, onRun, loading }: QueryInputProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); onRun() }
  return (
    <Box component="form" onSubmit={handleSubmit} aria-label="Query input form">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
        <TextField
          fullWidth
          variant="outlined"
          label="Enter your research query"
          placeholder="Enter your research query"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          aria-label="Research query input"
        />
        <Button sx={{ minWidth: 180 }} variant="contained" color="primary" onClick={onRun} disabled={loading} aria-label="Run Research">
          {loading ? 'Running…' : 'RUN RESEARCH'}
        </Button>
      </Stack>
    </Box>
  )
})
