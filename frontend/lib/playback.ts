export function pauseOtherPreviews(active:HTMLVideoElement){for(const video of document.querySelectorAll("video"))if(video!==active&&!video.paused)video.pause();}
