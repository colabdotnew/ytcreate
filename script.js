document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Icons ---
    lucide.createIcons();

    // --- State Management ---
    let mediaPool = [];
    let timeline = { video: [], audio: [] };
    let isPlaying = false;
    let currentTime = 0;
    let duration = 30;
    let selectedClip = null;
    let zoom = 50; // pixels per second
    const mediaElements = {}; // { clipId: { element, type } }
    let animationFrameId;
    let lastFrameTime;

    // --- DOM Element References ---
    const fileInput = document.getElementById('file-input');
    const mediaPoolList = document.getElementById('media-pool-list');
    const previewCanvas = document.getElementById('preview-canvas');
    const ctx = previewCanvas.getContext('2d');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const timeDisplay = document.getElementById('time-display');
    const timelineContainer = document.getElementById('timeline-container');
    const timelineContent = document.getElementById('timeline-content');
    const videoTrack = document.getElementById('video-track');
    const audioTrack = document.getElementById('audio-track');
    const playhead = document.getElementById('playhead');
    const zoomSlider = document.getElementById('zoom-slider');
    const splitBtn = document.getElementById('split-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    const notificationClose = document.getElementById('notification-close');

    // --- Helper Functions ---
    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const milliseconds = Math.floor((time % 1) * 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    };

    const showNotification = (message) => {
        notificationMessage.textContent = message;
        notification.classList.remove('hidden');
        setTimeout(() => notification.classList.add('hidden'), 3000);
    };

    // --- Rendering Functions ---
    const renderMediaPool = () => {
        mediaPoolList.innerHTML = '';
        mediaPool.forEach(media => {
            const div = document.createElement('div');
            div.className = 'flex items-center bg-gray-700 p-2 rounded-md';
            let iconType = 'file';
            if (media.type.startsWith('video')) iconType = 'video';
            if (media.type.startsWith('image')) iconType = 'image';
            if (media.type.startsWith('audio')) iconType = 'music';
            
            div.innerHTML = `
                <i data-lucide="${iconType}" class="w-5 h-5 mr-2 ${
                    iconType === 'video' ? 'text-blue-400' : 
                    iconType === 'image' ? 'text-green-400' : 
                    iconType === 'audio' ? 'text-purple-400' : ''
                }"></i>
                <span class="text-sm text-gray-200 truncate flex-grow">${media.name}</span>
                <button data-media-id="${media.id}" class="add-to-timeline ml-2 p-1 bg-green-600 rounded-md hover:bg-green-700">
                    <i data-lucide="plus" class="w-4 h-4 text-white"></i>
                </button>
            `;
            mediaPoolList.appendChild(div);
        });
        lucide.createIcons();
    };

    const renderTimeline = () => {
        // Clear existing clips
        videoTrack.querySelectorAll('.clip').forEach(c => c.remove());
        audioTrack.querySelectorAll('.clip').forEach(c => c.remove());

        timelineContent.style.width = `${duration * zoom}px`;

        const createClipElement = (clip, trackType) => {
            const clipEl = document.createElement('div');
            clipEl.className = 'clip absolute top-1/2 -translate-y-1/2 h-5/6 rounded-md overflow-hidden cursor-pointer border-2';
            clipEl.dataset.clipId = clip.id;
            clipEl.dataset.trackType = trackType;
            
            const isImage = clip.mediaType.startsWith('image');
            const bgColor = isImage ? 'bg-green-700' : (trackType === 'video' ? 'bg-blue-700' : 'bg-purple-700');
            clipEl.classList.add(bgColor);
            
            clipEl.style.left = `${clip.start * zoom}px`;
            clipEl.style.width = `${clip.duration * zoom}px`;
            clipEl.style.borderColor = (selectedClip && selectedClip.id === clip.id) ? '#facc15' : 'transparent';

            clipEl.innerHTML = `
                <div class="text-white text-xs truncate px-2 py-1 h-full w-full flex items-center">${clip.name}</div>
                ${isImage ? `<div class="resize-handle absolute right-0 top-0 bottom-0 w-2 bg-yellow-400 cursor-ew-resize opacity-50 hover:opacity-100"></div>` : ''}
            `;
            return clipEl;
        };

        timeline.video.forEach(clip => videoTrack.appendChild(createClipElement(clip, 'video')));
        timeline.audio.forEach(clip => audioTrack.appendChild(createClipElement(clip, 'audio')));
        updateTimeDisplay();
    };
    
    const updateTimeDisplay = () => {
            timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    };

    const updatePlayheadPosition = () => {
        playhead.style.left = `${currentTime * zoom}px`;
    };

    // --- Core Logic ---
    const update = (time) => {
        if (!isPlaying) return;
        
        const now = performance.now();
        const deltaTime = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
        lastFrameTime = now;
        
        currentTime += deltaTime;

        if (currentTime >= duration) {
            currentTime = duration;
            togglePlayPause();
        }

        updatePlayheadPosition();
        updateTimeDisplay();
        drawPreviewFrame();
        syncAudio();
        
        animationFrameId = requestAnimationFrame(update);
    };

    const drawPreviewFrame = () => {
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

        const activeVideoClip = timeline.video.find(c => currentTime >= c.start && currentTime < c.start + c.duration);
        if (activeVideoClip) {
            const media = mediaElements[activeVideoClip.id];
            if (media && media.element) {
                if (activeVideoClip.mediaType.startsWith('video')) {
                    const videoEl = media.element;
                    const timeInClip = currentTime - activeVideoClip.start + activeVideoClip.mediaStart;
                    if (videoEl.readyState >= 2 && Math.abs(videoEl.currentTime - timeInClip) > 0.1) {
                        videoEl.currentTime = timeInClip;
                    }
                     try {
                        ctx.drawImage(videoEl, 0, 0, previewCanvas.width, previewCanvas.height);
                    } catch (e) { /* ignore */ }
                } else if (activeVideoClip.mediaType.startsWith('image')) {
                    ctx.drawImage(media.element, 0, 0, previewCanvas.width, previewCanvas.height);
                }
            }
        }
    };

    const syncAudio = () => {
        Object.values(timeline.audio).forEach(clip => {
            const media = mediaElements[clip.id];
            if (media && media.element) {
                const audio = media.element;
                const timeInClip = currentTime - clip.start + clip.mediaStart;
                const isClipActive = currentTime >= clip.start && currentTime < clip.start + clip.duration;

                if (isPlaying && isClipActive) {
                    if (audio.paused) audio.play().catch(e => {});
                    if (Math.abs(audio.currentTime - timeInClip) > 0.2) {
                        audio.currentTime = timeInClip;
                    }
                } else {
                    if (!audio.paused) audio.pause();
                }
            }
        });
    };

    const togglePlayPause = () => {
        isPlaying = !isPlaying;
        playPauseBtn.innerHTML = `<i data-lucide="${isPlaying ? 'pause' : 'play'}" class="w-6 h-6"></i>`;
        lucide.createIcons();

        if (isPlaying) {
            if (currentTime >= duration) currentTime = 0;
            lastFrameTime = performance.now();
            animationFrameId = requestAnimationFrame(update);
        } else {
            cancelAnimationFrame(animationFrameId);
            Object.values(mediaElements).forEach(media => {
                if (media.type.startsWith('audio') && !media.element.paused) {
                    media.element.pause();
                }
            });
        }
    };
    
    const addMediaToTimeline = (media) => {
        const newClip = {
            id: `clip_${Date.now()}_${Math.random()}`,
            mediaId: media.id,
            name: media.name,
            mediaType: media.type,
            start: currentTime,
            duration: media.type.startsWith('image') ? 5 : 0,
            mediaStart: 0,
        };

        const element = document.createElement(media.type.startsWith('video') ? 'video' : (media.type.startsWith('audio') ? 'audio' : 'img'));
        element.src = media.url;
        element.muted = media.type.startsWith('video');
        element.preload = 'auto';

        mediaElements[newClip.id] = { element, type: media.type };

        element.addEventListener('loadedmetadata', () => {
            if (!media.type.startsWith('image')) {
                newClip.duration = element.duration;
                duration = Math.max(duration, newClip.start + newClip.duration);
                renderTimeline();
            }
        });
        
        if (media.type.startsWith('image')) {
            duration = Math.max(duration, newClip.start + newClip.duration);
        }

        const trackType = media.type.startsWith('video') || media.type.startsWith('image') ? 'video' : 'audio';
        timeline[trackType].push(newClip);
        timeline[trackType].sort((a,b) => a.start - b.start);
        renderTimeline();
    };
    
    const updateSelectedClip = (newSelectedClip) => {
        selectedClip = newSelectedClip;
        splitBtn.disabled = !selectedClip;
        deleteBtn.disabled = !selectedClip;
        renderTimeline();
    };


    // --- Event Listeners ---
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        const newMedia = files.map(file => ({
            id: `media_${Date.now()}_${Math.random()}`,
            name: file.name,
            type: file.type,
            url: URL.createObjectURL(file),
        }));
        mediaPool.push(...newMedia);
        renderMediaPool();
    });

    mediaPoolList.addEventListener('click', (e) => {
        const button = e.target.closest('.add-to-timeline');
        if (button) {
            const mediaId = button.dataset.mediaId;
            const media = mediaPool.find(m => m.id === mediaId);
            if (media) addMediaToTimeline(media);
        }
    });

    playPauseBtn.addEventListener('click', togglePlayPause);
    
    timelineContainer.addEventListener('click', (e) => {
        if (e.target.closest('.clip')) return; // Ignore clicks on clips
        const rect = timelineContainer.getBoundingClientRect();
        const x = e.clientX - rect.left + timelineContainer.scrollLeft;
        currentTime = Math.max(0, Math.min(duration, x / zoom));
        updateSelectedClip(null);
        updatePlayheadPosition();
        updateTimeDisplay();
        drawPreviewFrame();
    });
    
    timelineContent.addEventListener('click', (e) => {
        const clipEl = e.target.closest('.clip');
        if (clipEl) {
            const clipId = clipEl.dataset.clipId;
            const trackType = clipEl.dataset.trackType;
            const clipData = timeline[trackType].find(c => c.id === clipId);
            updateSelectedClip({ ...clipData, trackType });
        }
    });

    zoomSlider.addEventListener('input', (e) => {
        zoom = Number(e.target.value);
        renderTimeline();
        updatePlayheadPosition();
    });
    
    notificationClose.addEventListener('click', () => notification.classList.add('hidden'));
    
    splitBtn.addEventListener('click', () => {
        if (!selectedClip || currentTime <= selectedClip.start || currentTime >= selectedClip.start + selectedClip.duration) {
            showNotification("Select a clip and move playhead over it to split.");
            return;
        }

        const { id, trackType } = selectedClip;
        const originalClip = timeline[trackType].find(c => c.id === id);
        const splitTimeInClip = currentTime - originalClip.start;

        const newClip = {
            ...originalClip,
            id: `clip_${Date.now()}_${Math.random()}`,
            start: currentTime,
            duration: originalClip.duration - splitTimeInClip,
            mediaStart: originalClip.mediaStart + splitTimeInClip,
        };
        originalClip.duration = splitTimeInClip;

        const originalMedia = mediaElements[originalClip.id];
        const newElement = document.createElement(originalMedia.type.startsWith('video') ? 'video' : 'audio');
        newElement.src = originalMedia.element.src;
        newElement.muted = originalMedia.type.startsWith('video');
        mediaElements[newClip.id] = { element: newElement, type: originalMedia.type };
        
        timeline[trackType].push(newClip);
        timeline[trackType].sort((a,b) => a.start - b.start);
        updateSelectedClip(null);
        renderTimeline();
    });
    
    deleteBtn.addEventListener('click', () => {
        if (!selectedClip) return;
        const { id, trackType } = selectedClip;
        timeline[trackType] = timeline[trackType].filter(c => c.id !== id);
        delete mediaElements[id];
        updateSelectedClip(null);
        renderTimeline();
    });
    
    // Image resize logic
    let isResizing = false;
    let clipToResize = null;
    timelineContent.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle')) {
            e.stopPropagation();
            isResizing = true;
            const clipEl = e.target.closest('.clip');
            const clipId = clipEl.dataset.clipId;
            clipToResize = timeline.video.find(c => c.id === clipId);
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing || !clipToResize) return;
        const rect = timelineContainer.getBoundingClientRect();
        const x = e.clientX - rect.left + timelineContainer.scrollLeft;
        const newWidth = x - (clipToResize.start * zoom);
        let newDuration = newWidth / zoom;
        if (newDuration < 0.5) newDuration = 0.5;
        
        clipToResize.duration = newDuration;
        duration = Math.max(duration, ...timeline.video.map(c => c.start + c.duration), ...timeline.audio.map(c => c.start + c.duration));
        renderTimeline();
    });

    window.addEventListener('mouseup', () => {
        isResizing = false;
        clipToResize = null;
    });


    // --- Initial Render ---
    renderTimeline();
    drawPreviewFrame();
});
