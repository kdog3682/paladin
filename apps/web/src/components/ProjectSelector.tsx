// @paladin/web/src/components/ProjectSelector.tsx

import { useState } from "react"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@paladin/ui"
import { ChevronDown, Check, Folder } from "lucide-react"
import { useStore } from "../store"

export function ProjectSelector() {
  const projectName = useStore((s) => s.projectName)
  const projects = useStore((s) => s.projects)
  const setProject = useStore((s) => s.setProject)
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-accent transition-colors">
          <Folder className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-medium text-foreground">@{projectName}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0 bg-popover border-border" align="start">
        <Command>
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>No projects found</CommandEmpty>
            <CommandGroup>
              {projects.map((project) => (
                <CommandItem
                  key={project}
                  value={project}
                  onSelect={() => {
                    setProject(project)
                    setOpen(false)
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={`w-3.5 h-3.5 ${project === projectName ? "opacity-100" : "opacity-0"}`}
                  />
                  <span>@{project}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
