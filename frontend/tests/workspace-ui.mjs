export async function openEditingTools(page){const summary=page.getByText("More editing tools",{exact:true});if(!(await summary.evaluate(element=>element.parentElement.open)))await summary.click();}
export async function openPlaybackOptions(page){const summary=page.getByText("Playback options",{exact:true});if(!(await summary.evaluate(element=>element.parentElement.open)))await summary.click();}
