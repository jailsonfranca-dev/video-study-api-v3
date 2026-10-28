const videoRepository =
    require('../repositories/videoRepository');

const googleDriveService =
    require('./googleDriveService');

const AppError =
    require('../errors/AppError');

function getHeader(headers, name) {

    if (!headers) {
        return null;
    }

    if (typeof headers.get === 'function') {
        return headers.get(name);
    }

    return (
        headers[name] ||
        headers[name.toLowerCase()] ||
        null
    );
}

const MAX_CHUNK_SIZE = 4 * 1024 * 1024;

function buildVideoRange(range, fileSize) {
    const size = Number(fileSize);

    if (!Number.isSafeInteger(size) || size <= 0) {
        throw new AppError(
            'Tamanho do arquivo inválido.',
            500
        );
    }

    // Se o navegador não fornecer Range,
    // começamos pelo primeiro bloco.
    if (!range) {
        const end = Math.min(
            MAX_CHUNK_SIZE - 1,
            size - 1
        );

        return `bytes=0-${end}`;
    }

    // Aceita bytes=0-, bytes=100-200
    // e bytes=-500 (últimos 500 bytes).
    const match = /^bytes=(\d*)-(\d*)$/.exec(
        range.trim()
    );

    if (!match || (!match[1] && !match[2])) {
        throw new AppError(
            'Intervalo de bytes inválido.',
            416
        );
    }

    let start;
    let end;

    if (!match[1]) {
        const suffixLength = Number(match[2]);

        if (!Number.isSafeInteger(suffixLength) ||
            suffixLength <= 0) {
            throw new AppError(
                'Intervalo de bytes inválido.',
                416
            );
        }

        start = Math.max(0, size - suffixLength);
        end = size - 1;
    } else {
        start = Number(match[1]);

        end = match[2]
            ? Number(match[2])
            : size - 1;
    }

    if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start >= size ||
        start < 0 ||
        end < start
    ) {
        throw new AppError(
            'Intervalo de bytes inválido.',
            416
        );
    }

    end = Math.min(
        end,
        size - 1,
        start + MAX_CHUNK_SIZE - 1
    );

    return `bytes=${start}-${end}`;
}

async function createVideoStream(
    userId,
    videoId,
    range
) {

    const video =
        await videoRepository
            .findById(videoId);


    if (!video) {

        throw new AppError(
            'Vídeo não encontrado.',
            404
        );

    }


    if (!video.drive_file_id) {

        throw new AppError(
            'Vídeo não possui arquivo associado no Google Drive.',
            404
        );

    }


    if (
        !video.mime_type ||
        !video.mime_type.startsWith('video/')
    ) {

        throw new AppError(
            'O arquivo solicitado não é um vídeo.',
            400
        );

    }


    const drive =
        await googleDriveService
            .createAuthenticatedDriveClient(
                userId
            );


    try {

        /*const requestOptions = {
            responseType: 'stream'
        };*/


        /*
         * Se o navegador pediu um intervalo,
         * encaminhamos exatamente esse Range
         * para o Google Drive.
         */
        /*if (range) {

            requestOptions.headers = {
                Range: range
            };

        }*/

        const optimizedRange = buildVideoRange(
            range,
            video.size_bytes
        );

        const requestOptions = {
            responseType: 'stream',
            headers: {
                Range: optimizedRange
            }
        };

        console.log('[VIDEO STREAM] Range:', {
            videoId,
            requestedRange: range || 'none',
            optimizedRange
        });


        const googleResponse =
            await drive.files.get(
                {
                    fileId:
                    video.drive_file_id,

                    alt:
                        'media',

                    supportsAllDrives:
                        true
                },

                requestOptions
            );


        return {

            stream:
            googleResponse.data,

            status:
            googleResponse.status,

            contentType:
                getHeader(
                    googleResponse.headers,
                    'content-type'
                ) ||
                video.mime_type ||
                'application/octet-stream',

            contentLength:
                getHeader(
                    googleResponse.headers,
                    'content-length'
                ),

            contentRange:
                getHeader(
                    googleResponse.headers,
                    'content-range'
                ),

            acceptRanges:
                getHeader(
                    googleResponse.headers,
                    'accept-ranges'
                ) || 'bytes',

            video
        };


    }  catch (error) {
    const status =
        error.response?.status ||
        error.code;

    console.error('[VIDEO STREAM] Google Drive:', {
        videoId,
        userId,
        status,
        googleErrors: error.response?.data?.error?.errors?.map(
            item => ({
                reason: item.reason,
                message: item.message
            })
        ) || null,
        message: error.message
    });

    if (status === 404) {
        throw new AppError(
            'Arquivo de vídeo não encontrado ou sem acesso no Google Drive.',
            404
        );
    }

    if (status === 403) {
        throw new AppError(
            'A conta Google não possui permissão para reproduzir este vídeo.',
            403
        );
    }

    if (status === 416) {
        throw new AppError(
            'Intervalo de bytes inválido.',
            416
        );
    }

    throw error;
}
}
module.exports = {
    createVideoStream
};