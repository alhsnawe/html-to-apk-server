const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'HTML to APK Server is running',
        version: '1.0.0'
    });
});

app.post('/build', async (req, res) => {
    try {
        const { htmlCode, appName, packageName } = req.body;

        if (!htmlCode || !appName || !packageName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        console.log(`Building APK for: ${appName}`);

        const projectId = Date.now().toString();
        const projectDir = path.join(TEMP_DIR, projectId);
        fs.mkdirSync(projectDir, { recursive: true });

        const htmlFile = path.join(projectDir, 'index.html');
        fs.writeFileSync(htmlFile, htmlCode);

        const cordovaCmd = `
            cd "${projectDir}" && \
            npx cordova create app ${packageName} ${appName} && \
            cd app && \
            npx cordova platform add android && \
            rm -rf www/* && \
            cp "${htmlFile}" www/index.html && \
            npx cordova build android
        `;

        exec(cordovaCmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Build error:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Build failed',
                    details: error.message
                });
            }

            const apkPath = path.join(projectDir, 'app', 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

            if (!fs.existsSync(apkPath)) {
                return res.status(500).json({
                    success: false,
                    error: 'APK not found after build'
                });
            }

            res.download(apkPath, `${appName}.apk`, (err) => {
                if (err) console.error('Download error:', err);
                fs.rmSync(projectDir, { recursive: true, force: true });
            });
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});