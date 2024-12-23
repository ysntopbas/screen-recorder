const { ipcRenderer } = require('electron');

let mediaRecorder;
let recordedChunks = [];
let selectedSource = null;
let previewStream = null;
let webcamStream = null;
let isWebcamActive = false;
let recordingTimer = null;
let startTime = null;

async function getVideoSources() {
    try {
        const sources = await ipcRenderer.invoke('GET_SOURCES');
        //console.log('Bulunan kaynaklar:', sources); // Debug için

        const sourcesList = document.getElementById('sourcesList');
        sourcesList.innerHTML = '';
        
        sources.forEach(source => {
            //console.log('İşlenen kaynak:', source.name); // Debug için
            const sourceItem = document.createElement('div');
            sourceItem.className = 'source-item';
            sourceItem.innerHTML = `
                <img src="${source.thumbnail.toDataURL()}" alt="${source.name}">
                <p>${source.name}</p>
            `;
            
            sourceItem.onclick = () => selectSource(source, sourceItem);
            sourcesList.appendChild(sourceItem);
        });
    } catch (e) {
        console.error('Ekran kaynakları alınamadı:', e);
        alert('Ekran kaynakları alınırken bir hata oluştu: ' + e.message);
    }
}

async function selectSource(source, sourceItem) {
    try {
        // Önceki seçimleri temizle
        document.querySelectorAll('.source-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Yeni kaynağı seç
        selectedSource = source;
        sourceItem.classList.add('selected');
        
        // Kayıt başlat butonunu aktif et
        document.getElementById('startBtn').disabled = false;
        
        // Önizleme başlat
        await startPreview(source.id);
    } catch (e) {
        console.error('Kaynak seçilirken hata:', e);
        alert('Kaynak seçilirken bir hata oluştu: ' + e.message);
    }
}

async function startPreview(sourceId) {
    try {
        const quality = document.getElementById('videoQuality').value.split(':');
        const fps = document.getElementById('fps').value;
        
        const constraints = {
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop'
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    minWidth: parseInt(quality[0]),
                    maxWidth: parseInt(quality[0]),
                    minHeight: parseInt(quality[1]),
                    maxHeight: parseInt(quality[1]),
                    minFrameRate: parseInt(fps),
                    maxFrameRate: parseInt(fps)
                }
            }
        };

        // Önceki stream'i durdur
        if (previewStream) {
            previewStream.getTracks().forEach(track => track.stop());
        }

        previewStream = await navigator.mediaDevices.getUserMedia(constraints);
        const previewVideo = document.getElementById('preview');
        previewVideo.srcObject = previewStream;
        previewVideo.play();
    } catch (e) {
        console.error('Önizleme başlatılamadı:', e);
        alert('Önizleme başlatılırken bir hata oluştu: ' + e.message);
    }
}

async function toggleWebcam() {
    const webcamPreview = document.getElementById('webcamPreview');
    const webcamSettings = document.querySelector('.webcam-settings');
    
    if (!isWebcamActive) {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ 
                video: true,
                audio: false 
            });
            webcamPreview.srcObject = webcamStream;
            webcamPreview.style.display = 'block';
            webcamSettings.style.display = 'flex';
            isWebcamActive = true;
            document.getElementById('addWebcam').innerHTML = '<span>📹</span> Webcam Kapat';
        } catch (e) {
            console.error('Webcam erişimi hatası:', e);
            alert('Webcam erişimi sağlanamadı: ' + e.message);
        }
    } else {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
        }
        webcamPreview.srcObject = null;
        webcamPreview.style.display = 'none';
        webcamSettings.style.display = 'none';
        isWebcamActive = false;
        document.getElementById('addWebcam').innerHTML = '<span>📹</span> Webcam Ekle';
    }
}

document.getElementById('webcamSize').addEventListener('change', (e) => {
    const webcamPreview = document.getElementById('webcamPreview');
    webcamPreview.className = e.target.value;
    updateWebcamPosition(); // Mevcut konumu koru
});

document.getElementById('webcamPosition').addEventListener('change', updateWebcamPosition);

function updateWebcamPosition() {
    const webcamPreview = document.getElementById('webcamPreview');
    const position = document.getElementById('webcamPosition').value;
    
    // Önce tüm pozisyon sınıflarını kaldır
    webcamPreview.classList.remove('top-right', 'top-left', 'bottom-right', 'bottom-left');
    // Yeni pozisyon sınıfını ekle
    webcamPreview.classList.add(position);
}

document.getElementById('addWebcam').addEventListener('click', toggleWebcam);

document.getElementById('startBtn').onclick = async () => {
    if (!selectedSource) {
        alert('Lütfen bir ekran seçin!');
        return;
    }

    try {
        const quality = document.getElementById('videoQuality').value.split(':');
        const fps = document.getElementById('fps').value;
        
        // Ekran görüntüsü için stream
        const videoConstraints = {
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop'
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: selectedSource.id,
                    minWidth: parseInt(quality[0]),
                    maxWidth: parseInt(quality[0]),
                    minHeight: parseInt(quality[1]),
                    maxHeight: parseInt(quality[1]),
                    minFrameRate: parseInt(fps),
                    maxFrameRate: parseInt(fps)
                }
            }
        };

        // Ses ve ekran stream'ini al
        const desktopStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
        const audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true,
            video: false 
        });

        // Tüm stream'leri birleştir
        const tracks = [...desktopStream.getTracks()];
        
        // Ses ekle
        tracks.push(...audioStream.getAudioTracks());
        
        // Eğer webcam aktifse, onu da ekle
        if (isWebcamActive && webcamStream) {
            tracks.push(...webcamStream.getVideoTracks());
        }

        const format = document.getElementById('videoFormat').value;
        let options = {
            videoBitsPerSecond: 8000000 // 8 Mbps
        };

        // Format seçimine göre codec ayarla
        if (format === 'webm') {
            options.mimeType = 'video/webm;codecs=vp8,opus';
        } else if (format === 'mp4') {
            options.mimeType = 'video/mp4;codecs=h264,aac';
        } else if (format === 'mkv') {
            options.mimeType = 'video/webm;codecs=vp9,opus';
        }

        // Seçilen codec kullanılamıyorsa varsayılan codec'e dön
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn(`${options.mimeType} desteklenmiyor, varsayılan codec kullanılacak`);
            options = { 
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: 8000000
            };
        }

        const combinedStream = new MediaStream(tracks);
        mediaRecorder = new MediaRecorder(combinedStream, options);
        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.start();
        
        // Recording göstergesi ve timer'ı başlat
        document.querySelector('.recording-indicator').style.display = 'flex';
        document.querySelector('.timer').style.display = 'block';
        startTime = new Date().getTime();
        recordingTimer = setInterval(updateTimer, 1000);
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
    } catch (e) {
        console.error('Kayıt başlatılamadı:', e);
        alert('Kayıt başlatılırken bir hata oluştu: ' + e.message);
    }
};

document.getElementById('stopBtn').onclick = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        // Recording göstergesi ve timer'ı durdur
        document.querySelector('.recording-indicator').style.display = 'none';
        document.querySelector('.timer').style.display = 'none';
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Tüm stream'leri temizle
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
    }
};

function handleDataAvailable(e) {
    recordedChunks.push(e.data);
    if (mediaRecorder.state === 'inactive') {
        const format = document.getElementById('videoFormat').value;
        const blob = new Blob(recordedChunks, { 
            type: format === 'mp4' ? 'video/mp4' : 'video/webm'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kayit_${new Date().toISOString().slice(0,19).replace(/[:-]/g, '')}.${format}`;
        a.click();
        recordedChunks = [];
    }
}

// Kalite veya FPS değiştiğinde önizlemeyi güncelle
document.getElementById('videoQuality').onchange = () => {
    if (selectedSource) {
        startPreview(selectedSource.id);
    }
};

document.getElementById('fps').onchange = () => {
    if (selectedSource) {
        startPreview(selectedSource.id);
    }
};

// Başlangıçta kaynakları yükle
getVideoSources();

// Her 5 saniyede bir kaynakları güncelle
setInterval(getVideoSources, 5000);

// En üste tema ile ilgili kodları ekleyelim
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButton(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
    const button = document.getElementById('themeToggle');
    button.innerHTML = theme === 'light' ? '🌞 Tema Değiştir' : '🌙 Tema Değiştir';
}

// Tema toggle butonuna tıklama olayını ekle
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// Sayfa yüklendiğinde tema ayarını başlat
initTheme();

// Timer fonksiyonu
function updateTimer() {
    const currentTime = new Date().getTime();
    const elapsedTime = new Date(currentTime - startTime);
    const hours = elapsedTime.getUTCHours().toString().padStart(2, '0');
    const minutes = elapsedTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = elapsedTime.getUTCSeconds().toString().padStart(2, '0');
    
    document.querySelector('.timer').textContent = `${hours}:${minutes}:${seconds}`;
} 