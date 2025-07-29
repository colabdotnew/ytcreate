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
    let isResizing = false;
    let clipToResize = null;
    let isDraggingClip = false;
    let draggedClipInfo = null;


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
    const previewModal = document.getElementById('preview-modal');
    const previewModalContent = document.getElementById('preview-modal-content');
    const previewModalClose = document.getElementById('preview-modal-close');

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
            div.className = 'flex items-center bg-gray-700 p-2 rounded-md cursor-grab';
            div.draggable = true;
            div.dataset.mediaId = media.id;

            let iconType = 'file';
            if (media.type.startsWith('video')) iconType = 'video';
            if (media.type.startsWith('image')) iconType = 'image';
            if (media.type.startsWith('audio')) iconType = 'music';
            
            div.innerHTML = `
                <i data-lucide="${iconType}" class="w-5 h-5 mr-2 pointer-events-none ${
                    iconType === 'video' ? 'text-blue-400' : 
                    iconType === 'image' ? 'text-green-400' : 
                    iconType === 'audio' ? 'text-purple-400' : ''
                }"></i>
                <span class="text-sm text-gray-200 truncate flex-grow pointer-events-none">${media.name}</span>
                <button data-media-id="${media.id}" class="preview-media ml-2 p-1 bg-gray-600 rounded-md hover:bg-gray-500" title="Preview Media">
                    <i data-lucide="play" class="w-4 h-4 text-white"></i>
                </button>
                <button data-media-id="${media.id}" class="add-to-timeline ml-2 p-1 bg-green-600 rounded-md hover:bg-green-700" title="Add to Timeline at Playhead">
                    <i data-lucide="plus" class="w-4 h-4 text-white"></i>
                </button>
            `;
            mediaPoolList.appendChild(div);
        });
        lucide.createIcons();
    };

    const renderTimeline = () => {
        videoTrack.querySelectorAll('.clip').forEach(c => c.remove());
        audioTrack.querySelectorAll('.clip').forEach(c => c.remove());

        const totalDuration = Math.max(duration, ...timeline.video.map(c => c.start + c.duration), ...timeline.audio.map(c => c.start + c.duration));
        timelineContent.style.width = `${totalDuration * zoom}px`;

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
                <div class="text-white text-xs truncate px-2 py-1 h-full w-full flex items-center pointer-events-none">${clip.name}</div>
                ${isImage ? `<div class="resize-handle absolute right-0 top-0 bottom-0 w-2 bg-yellow-400 cursor-ew-resize opacity-50 hover:opacity-100"></div>` : ''}
            `;
            return clipEl;
        };

        timeline.video.forEach(clip => videoTrack.appendChild(createClipElement(clip, 'video')));
        timeline.audio.forEach(clip => audioTrack.appendChild(createClipElement(clip, 'audio')));
        updateTimeDisplay();
    };
    
    const updateTimeDisplay = () => {
        const totalDuration = Math.max(duration, ...timeline.video.map(c => c.start + c.duration), ...timeline.audio.map(c => c.start + c.duration));
        timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(totalDuration)}`;
    };

    const updatePlayheadPosition = () => {
        playhead.style.left = `${currentTime * zoom}px`;
    };

    // --- Core Logic ---
    const update = () => {
        if (!isPlaying) return;
        
        const now = performance.now();
        const deltaTime = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
        lastFrameTime = now;
        
        currentTime += deltaTime;

        const totalDuration = Math.max(duration, ...timeline.video.map(c => c.start + c.duration), ...timeline.audio.map(c => c.start + c.duration));
        if (currentTime >= totalDuration) {
            currentTime = totalDuration;
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
                     try { ctx.drawImage(videoEl, 0, 0, previewCanvas.width, previewCanvas.height); } catch (e) { /* ignore */ }
                } else if (activeVideoClip.mediaType.startsWith('image')) {
                    ctx.drawImage(media.element, 0, 0, previewCanvas.width, previewCanvas.height);
                }
            }
        }
    };

    const syncAudio = () => {
        timeline.audio.forEach(clip => {
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
            const totalDuration = Math.max(duration, ...timeline.video.map(c => c.start + c.duration), ...timeline.audio.map(c => c.start + c.duration));
            if (currentTime >= totalDuration) currentTime = 0;
            lastFrameTime = performance.now();
            animationFrameId = requestAnimationFrame(update);
        } else {
            cancelAnimationFrame(animationFrameId);
            Object.values(mediaElements).forEach(media => {
                if (media.element.tagName === 'AUDIO' && !media.element.paused) {
                    media.element.pause();
                }
            });
        }
    };
    
    const addMediaToTimeline = (media, startTime) => {
        const newClip = {
            id: `clip_${Date.now()}_${Math.random()}`,
            mediaId: media.id,
            name: media.name,
            mediaType: media.type,
            start: startTime,
            duration: media.type.startsWith('image') ? 5 : 0,
            mediaStart: 0,
        };

        const element = document.createElement(media.type.startsWith('video') ? 'video' : (media.type.startsWith('audio') ? 'audio' : 'img'));
        element.src = media.url;
        element.muted = media.type.startsWith('video');
        element.preload = 'auto';

        mediaElements[newClip.id] = { element, type: media.type };

        const onMetadataLoaded = () => {
            if (!media.type.startsWith('image')) {
                newClip.duration = element.duration;
            }
            const trackType = media.type.startsWith('video') || media.type.startsWith('image') ? 'video' : 'audio';
            timeline[trackType].push(newClip);
            timeline[trackType].sort((a,b) => a.start - b.start);
            renderTimeline();
        };

        if (media.type.startsWith('image')) {
            element.onload = onMetadataLoaded;
        } else {
            element.onloadedmetadata = onMetadataLoaded;
        }
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
        const addButton = e.target.closest('.add-to-timeline');
        const previewButton = e.target.closest('.preview-media');

        if (addButton) {
            const mediaId = addButton.dataset.mediaId;
            const media = mediaPool.find(m => m.id === mediaId);
            if (media) addMediaToTimeline(media, currentTime);
        } else if (previewButton) {
            const mediaId = previewButton.dataset.mediaId;
            const media = mediaPool.find(m => m.id === mediaId);
            if(media) {
                previewModalContent.innerHTML = '';
                let previewElement;
                if (media.type.startsWith('video')) {
                    previewElement = document.createElement('video');
                    previewElement.src = media.url;
                    previewElement.controls = true;
                    previewElement.autoplay = true;
                    previewElement.className = "max-w-full max-h-[80vh]";
                } else if (media.type.startsWith('image')) {
                    previewElement = document.createElement('img');
                    previewElement.src = media.url;
                    previewElement.className = "max-w-full max-h-[80vh] object-contain";
                }
                if (previewElement) {
                    previewModalContent.appendChild(previewElement);
                    previewModal.classList.remove('hidden');
                    lucide.createIcons(); // Re-render icons if any in the modal
                }
            }
        }
    });

    previewModalClose.addEventListener('click', () => {
        previewModal.classList.add('hidden');
        previewModalContent.innerHTML = ''; // Crucial to stop video/audio playback
    });

    playPauseBtn.addEventListener('click', togglePlayPause);
    
    timelineContainer.addEventListener('click', (e) => {
        if (e.target.closest('.clip')) return; 
        const rect = timelineContainer.getBoundingClientRect();
        const x = e.clientX - rect.left + timelineContainer.scrollLeft;
        const totalDuration = Math.max(duration, ...timeline.video.map(c => c.start + c.duration), ...timeline.audio.map(c => c.start + c.duration));
        currentTime = Math.max(0, Math.min(totalDuration, x / zoom));
        
        updateSelectedClip(null);
        updatePlayheadPosition();
        updateTimeDisplay();
        if(!isPlaying) drawPreviewFrame();
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

        const newClip = { ...originalClip, id: `clip_${Date.now()}_${Math.random()}`, start: currentTime, duration: originalClip.duration - splitTimeInClip, mediaStart: originalClip.mediaStart + splitTimeInClip };
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
    
    // --- Drag & Drop / Repositioning Event Listeners ---

    // Drag from media pool
    mediaPoolList.addEventListener('dragstart', (e) => {
        if (e.target.dataset.mediaId) {
            e.dataTransfer.setData('text/plain', e.target.dataset.mediaId);
            e.target.classList.add('dragging');
        }
    });

    mediaPoolList.addEventListener('dragend', (e) => {
        if (e.target.dataset.mediaId) {
            e.target.classList.remove('dragging');
        }
    });

    timelineContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        timelineContainer.classList.add('drag-over');
    });

    timelineContainer.addEventListener('dragleave', (e) => {
        timelineContainer.classList.remove('drag-over');
    });

    timelineContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        timelineContainer.classList.remove('drag-over');
        const mediaId = e.dataTransfer.getData('text/plain');
        const media = mediaPool.find(m => m.id === mediaId);
        if (media) {
            const rect = timelineContainer.getBoundingClientRect();
            const x = e.clientX - rect.left + timelineContainer.scrollLeft;
            const dropTime = Math.max(0, x / zoom);
            addMediaToTimeline(media, dropTime);
        }
    });

    // Reposition and resize clips on the timeline
    timelineContent.addEventListener('mousedown', (e) => {
        const clipEl = e.target.closest('.clip');
        if (!clipEl) return;

        // Resize logic
        if (e.target.classList.contains('resize-handle')) {
            e.stopPropagation();
            isResizing = true;
            const clipId = clipEl.dataset.clipId;
            clipToResize = timeline.video.find(c => c.id === clipId);
            return;
        }

        // Reposition (drag) logic
        e.stopPropagation();
        isDraggingClip = true;
        const clipId = clipEl.dataset.clipId;
        const trackType = clipEl.dataset.trackType;
        const clipData = timeline[trackType].find(c => c.id === clipId);
        updateSelectedClip({ ...clipData, trackType });

        const clipRect = clipEl.getBoundingClientRect();
        const dragOffsetX = e.clientX - clipRect.left;
        draggedClipInfo = { clip: clipData, trackType, dragOffsetX };
    });

    window.addEventListener('mousemove', (e) => {
        if (isResizing && clipToResize) {
            const rect = timelineContainer.getBoundingClientRect();
            const x = e.clientX - rect.left + timelineContainer.scrollLeft;
            const newWidth = x - (clipToResize.start * zoom);
            let newDuration = newWidth / zoom;
            if (newDuration < 0.5) newDuration = 0.5;
            
            clipToResize.duration = newDuration;
            renderTimeline();
        } else if (isDraggingClip && draggedClipInfo) {
            const rect = timelineContainer.getBoundingClientRect();
            const xOnTimeline = e.clientX - rect.left + timelineContainer.scrollLeft;
            const offsetInPixels = draggedClipInfo.dragOffsetX;
            
            const newStartInPixels = xOnTimeline - offsetInPixels;
            const newStartTime = Math.max(0, newStartInPixels / zoom);

            draggedClipInfo.clip.start = newStartTime;
            renderTimeline();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingClip) {
            timeline[draggedClipInfo.trackType].sort((a,b) => a.start - b.start);
        }
        isResizing = false;
        clipToResize = null;
        isDraggingClip = false;
        draggedClipInfo = null;
    });

    // --- Initial Render ---
    renderTimeline();
    drawPreviewFrame();
});
