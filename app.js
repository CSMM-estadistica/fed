// Estado global
const state = {
    nominal: null,
    maestro: null,
    resultado: null,
    resumen: null,
    procesando: false
};

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    const hoy = new Date();
    const hace6Meses = new Date();
    hace6Meses.setMonth(hoy.getMonth() - 6);
    
    document.getElementById('fechaInicio').value = hace6Meses.toISOString().split('T')[0];
    document.getElementById('fechaFin').value = hoy.toISOString().split('T')[0];
    
    document.getElementById('nominalFile').addEventListener('change', handleNominalFile);
    document.getElementById('maestroFile').addEventListener('change', handleMaestroFile);
    document.getElementById('btnProcesar').addEventListener('click', procesar);
});

// Manejo de archivos
function handleNominalFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
            state.nominal = result.data;
            
            const box = document.getElementById('nominalUpload');
            box.classList.add('loaded');
            document.getElementById('nominalStatus').textContent = `✅ ${state.nominal.length} registros`;
            document.getElementById('nominalStatus').className = 'file-status loaded';
            document.getElementById('nominalCount').textContent = state.nominal.length;
            
            addLog('✅ NominalTrama cargado: ' + state.nominal.length + ' registros');
            checkReady();
        } catch (error) {
            addLog('❌ Error: ' + error.message);
            alert('Error: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function handleMaestroFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
            state.maestro = result.data;
            
            const box = document.getElementById('maestroUpload');
            box.classList.add('loaded');
            document.getElementById('maestroStatus').textContent = `✅ ${state.maestro.length} registros`;
            document.getElementById('maestroStatus').className = 'file-status loaded';
            document.getElementById('maestroCount').textContent = state.maestro.length;
            
            addLog('✅ MaestroPaciente cargado: ' + state.maestro.length + ' registros');
            checkReady();
        } catch (error) {
            addLog('❌ Error: ' + error.message);
            alert('Error: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function checkReady() {
    const ready = state.nominal && state.maestro;
    document.getElementById('btnProcesar').disabled = !ready;
    if (ready) addLog('✅ Archivos listos');
}

// Log
function addLog(message) {
    const container = document.getElementById('logContainer');
    document.getElementById('logCard').style.display = 'block';
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

function clearLog() {
    document.getElementById('logContainer').innerHTML = '<div class="log-entry">📋 Log limpiado</div>';
}

// Procesamiento
async function procesar() {
    if (state.procesando) return;
    if (!state.nominal || !state.maestro) {
        alert('Primero cargue ambos archivos');
        return;
    }
    
    state.procesando = true;
    const btn = document.getElementById('btnProcesar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    
    const progressContainer = document.getElementById('progressContainer');
    progressContainer.style.display = 'block';
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    try {
        addLog('⏳ Cargando motor SQL...');
        await cargarSQLJS();
        
        addLog('⏳ Creando base de datos...');
        const db = new SQL.Database();
        
        addLog('⏳ Cargando datos...');
        updateProgress(20);
        cargarDatosSQLite(db);
        updateProgress(40);
        
        const fechaInicio = document.getElementById('fechaInicio').value;
        const fechaFin = document.getElementById('fechaFin').value;
        const indicador = document.getElementById('indicadorSelect').value;
        
        addLog(`⏳ Procesando ${indicador}...`);
        updateProgress(60);
        
        const query = indicador === 'VI-01.01' 
            ? queryVI0101(fechaInicio, fechaFin)
            : queryVI0102(fechaInicio, fechaFin);
        
        const resultados = db.exec(query);
        updateProgress(80);
        
        if (resultados.length === 0 || resultados[0].values.length === 0) {
            addLog('ℹ️ No se encontraron pacientes');
            alert('No hay resultados para este rango');
            state.procesando = false;
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play"></i> Generar Reporte';
            return;
        }
        
        const columns = resultados[0].columns;
        const rows = resultados[0].values;
        
        const df = rows.map(row => {
            const obj = {};
            columns.forEach((col, i) => obj[col] = row[i]);
            return obj;
        });
        
        const sumaDenominador = df.reduce((sum, r) => sum + (r.DENOMINADOR || 0), 0);
        const sumaNumerador = df.reduce((sum, r) => sum + (r.NUMERADOR || 0), 0);
        const porcentajeAvance = sumaDenominador > 0 ? (sumaNumerador / sumaDenominador * 100) : 0;
        
        state.resultado = df;
        state.resumen = {
            total: df.length,
            denominador: sumaDenominador,
            numerador: sumaNumerador,
            porcentaje: porcentajeAvance
        };
        
        updateProgress(100);
        addLog('✅ Procesamiento completado');
        
        mostrarResultados(df, state.resumen);
        db.close();
        
    } catch (error) {
        addLog('❌ Error: ' + error.message);
        alert('Error: ' + error.message);
    } finally {
        state.procesando = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Generar Reporte';
    }
}

function updateProgress(value) {
    document.getElementById('progressBar').style.width = value + '%';
    document.getElementById('progressText').textContent = value + '%';
}

// Cargar SQL.js
function cargarSQLJS() {
    return new Promise((resolve, reject) => {
        if (typeof SQL !== 'undefined') { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.1/sql-wasm.js';
        script.onload = function() {
            if (typeof initSqlJs === 'function') {
                initSqlJs({ locateFile: function(file) {
                    return 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.1/' + file;
                }}).then(SQL => { window.SQL = SQL; resolve(); }).catch(reject);
            } else {
                window.SQL = SQL;
                resolve();
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function cargarDatosSQLite(db) {
    db.run(`CREATE TABLE NominalTrama (
        Id_Paciente TEXT, Id_Establecimiento TEXT, Fecha_Atencion TEXT,
        Codigo_Item TEXT, Tipo_Diagnostico TEXT, Anio_Actual_Paciente INTEGER,
        Historia_Clinica TEXT
    )`);
    
    db.run(`CREATE TABLE MaestroPaciente (
        Id_Paciente TEXT, Numero_Documento TEXT,
        Apellido_Paterno_Paciente TEXT, Apellido_Materno_Paciente TEXT,
        Nombres_Paciente TEXT, Historia_Clinica TEXT
    )`);
    
    const nominalColumns = ['Id_Paciente', 'Id_Establecimiento', 'Fecha_Atencion', 
                           'Codigo_Item', 'Tipo_Diagnostico', 'Anio_Actual_Paciente', 
                           'Historia_Clinica'];
    const batchSize = 500;
    
    for (let i = 0; i < state.nominal.length; i += batchSize) {
        const batch = state.nominal.slice(i, i + batchSize);
        const placeholders = batch.map(() => `(${nominalColumns.map(() => '?').join(',')})`).join(',');
        const values = batch.flatMap(row => nominalColumns.map(col => row[col] || ''));
        db.run(`INSERT INTO NominalTrama VALUES ${placeholders}`, values);
    }
    
    const maestroColumns = ['Id_Paciente', 'Numero_Documento', 'Apellido_Paterno_Paciente',
                           'Apellido_Materno_Paciente', 'Nombres_Paciente', 'Historia_Clinica'];
    
    for (let i = 0; i < state.maestro.length; i += batchSize) {
        const batch = state.maestro.slice(i, i + batchSize);
        const placeholders = batch.map(() => `(${maestroColumns.map(() => '?').join(',')})`).join(',');
        const values = batch.flatMap(row => maestroColumns.map(col => row[col] || ''));
        db.run(`INSERT INTO MaestroPaciente VALUES ${placeholders}`, values);
    }
}

function queryVI0101(f_i, f_f) {
    return `WITH APN AS (
        SELECT 
            Id_Paciente, 
            Id_Establecimiento, 
            Fecha_Atencion AS Fecha_APN
        FROM NominalTrama 
        WHERE Fecha_Atencion BETWEEN '${f_i}' AND '${f_f}'
          AND Codigo_Item IN ('Z3491','Z3492','Z3493','Z3591','Z3592','Z3593')
        GROUP BY Id_Paciente, Id_Establecimiento, Fecha_Atencion
    ),
    TAMIZAJE AS (
        SELECT 
            Id_Paciente, 
            Id_Establecimiento, 
            MIN(Fecha_Atencion) AS Fecha_Tamizaje
        FROM NominalTrama 
        WHERE Codigo_Item = '96150.01'
        GROUP BY Id_Paciente, Id_Establecimiento
    ),
    POSITIVO AS (
        SELECT 
            Id_Paciente, 
            Id_Establecimiento, 
            Fecha_Atencion AS Fecha_Positivo
        FROM NominalTrama 
        WHERE Codigo_Item = 'R456' 
          AND Tipo_Diagnostico = 'D'
        GROUP BY Id_Paciente, Id_Establecimiento, Fecha_Atencion
    ),
    GESTANTES AS (
        SELECT 
            A.Id_Paciente,
            A.Id_Establecimiento,
            A.Fecha_APN,
            T.Fecha_Tamizaje,
            R.Fecha_Positivo,
            1 AS DENOMINADOR,
            CASE 
                WHEN R.Id_Paciente IS NOT NULL 
                 AND R.Fecha_Positivo = A.Fecha_APN 
                THEN 1 ELSE 0 
            END AS NUMERADOR
        FROM APN A
        INNER JOIN TAMIZAJE T 
            ON T.Id_Paciente = A.Id_Paciente 
            AND T.Id_Establecimiento = A.Id_Establecimiento
        LEFT JOIN POSITIVO R 
            ON R.Id_Paciente = A.Id_Paciente 
            AND R.Id_Establecimiento = A.Id_Establecimiento
    )
    SELECT 
        P.Numero_Documento AS DNI_PACIENTE,
        P.Apellido_Paterno_Paciente || ' ' || P.Apellido_Materno_Paciente || ' ' || P.Nombres_Paciente AS PACIENTE,
        G.Fecha_APN AS "FECHA APN(Z34%-Z35%)",
        G.Fecha_Tamizaje AS "FECHA TAMIZAJE VIOLENCIA",
        G.Fecha_Positivo AS "FECHA POSITIVO",
        G.DENOMINADOR,
        G.NUMERADOR
    FROM GESTANTES G
    INNER JOIN MaestroPaciente P 
        ON P.Id_Paciente = G.Id_Paciente
    GROUP BY 
        P.Numero_Documento,
        PACIENTE,
        G.Fecha_APN,
        G.Fecha_Tamizaje,
        G.Fecha_Positivo,
        G.DENOMINADOR,
        G.NUMERADOR
    ORDER BY G.Fecha_APN`;
}
function queryVI0102(f_i, f_f) {
    return `WITH APN AS (SELECT Id_Paciente, Id_Establecimiento, Fecha_Atencion AS Fecha_APN
        FROM NominalTrama WHERE Fecha_Atencion BETWEEN '${f_i}' AND '${f_f}'
        AND Codigo_Item IN ('Z3491','Z3492','Z3493','Z3591','Z3592','Z3593')
        GROUP BY Id_Paciente, Id_Establecimiento, Fecha_Atencion),
    TAMIZAJE AS (SELECT Id_Paciente, Id_Establecimiento, MIN(Fecha_Atencion) AS Fecha_Tamizaje
        FROM NominalTrama WHERE Codigo_Item = '96150.01'
        GROUP BY Id_Paciente, Id_Establecimiento),
    VIOLENCIA AS (SELECT Id_Paciente, Id_Establecimiento, MIN(Fecha_Atencion) AS Fecha_R456
        FROM NominalTrama WHERE Codigo_Item = 'R456' AND Tipo_Diagnostico = 'D'
        GROUP BY Id_Paciente, Id_Establecimiento),
    DX AS (SELECT V.Id_Paciente, V.Id_Establecimiento, MIN(N.Fecha_Atencion) AS Fecha_DX
        FROM VIOLENCIA V INNER JOIN NominalTrama N ON N.Id_Paciente = V.Id_Paciente
        AND (N.Codigo_Item IN ('T740','T741','T742','T743','T748','T749')
        OR N.Codigo_Item LIKE 'Y04%' OR N.Codigo_Item LIKE 'Y05%'
        OR N.Codigo_Item LIKE 'Y06%' OR N.Codigo_Item LIKE 'Y07%' OR N.Codigo_Item LIKE 'Y08%')
        AND N.Tipo_Diagnostico IN ('D','P')
        AND julianday(N.Fecha_Atencion) - julianday(V.Fecha_R456) BETWEEN 0 AND 15
        GROUP BY V.Id_Paciente, V.Id_Establecimiento),
    DIAG_VISITA AS (SELECT DISTINCT Id_Paciente, Id_Establecimiento, Fecha_Atencion AS Fecha_Visita
        FROM NominalTrama WHERE (Codigo_Item IN ('T740','T741','T742','T743','T748','T749')
        OR Codigo_Item LIKE 'Y04%' OR Codigo_Item LIKE 'Y05%'
        OR Codigo_Item LIKE 'Y06%' OR Codigo_Item LIKE 'Y07%' OR Codigo_Item LIKE 'Y08%')
        AND Tipo_Diagnostico IN ('D','P','R')),
    CSM_RAW AS (SELECT N.Id_Paciente, N.Id_Establecimiento, N.Fecha_Atencion AS Fecha_CSM
        FROM NominalTrama N INNER JOIN DIAG_VISITA DV ON DV.Id_Paciente = N.Id_Paciente
        AND DV.Id_Establecimiento = N.Id_Establecimiento AND DV.Fecha_Visita = N.Fecha_Atencion
        WHERE N.Codigo_Item IN ('99207','99214.06','99215')
        GROUP BY N.Id_Paciente, N.Id_Establecimiento, N.Fecha_Atencion),
    INTERV_RAW AS (SELECT N.Id_Paciente, N.Id_Establecimiento, N.Fecha_Atencion AS Fecha_INT
        FROM NominalTrama N INNER JOIN DIAG_VISITA DV ON DV.Id_Paciente = N.Id_Paciente
        AND DV.Id_Establecimiento = N.Id_Establecimiento AND DV.Fecha_Visita = N.Fecha_Atencion
        WHERE N.Codigo_Item = '99207.01' OR N.Codigo_Item LIKE '90806%' OR N.Codigo_Item LIKE '90834%'
        OR N.Codigo_Item LIKE '90860%'
        GROUP BY N.Id_Paciente, N.Id_Establecimiento, N.Fecha_Atencion),
    CSM_PRIMERA AS (SELECT C.Id_Paciente, MIN(C.Fecha_CSM) AS Primera_CSM
        FROM CSM_RAW C INNER JOIN DX D ON D.Id_Paciente = C.Id_Paciente
        WHERE julianday(C.Fecha_CSM) - julianday(D.Fecha_DX) BETWEEN 0 AND 30
        GROUP BY C.Id_Paciente),
    CSM_OK AS (SELECT DISTINCT C.Id_Paciente
        FROM CSM_RAW C INNER JOIN CSM_PRIMERA P ON P.Id_Paciente = C.Id_Paciente
        WHERE julianday(C.Fecha_CSM) - julianday(P.Primera_CSM) BETWEEN 7 AND 30),
    INTERV_ORDENADA AS (SELECT I.Id_Paciente, I.Fecha_INT, D.Fecha_DX,
        LAG(I.Fecha_INT) OVER (PARTITION BY I.Id_Paciente ORDER BY I.Fecha_INT) AS Fecha_Prev
        FROM INTERV_RAW I INNER JOIN DX D ON D.Id_Paciente = I.Id_Paciente),
    INTERV_FLAGGED AS (SELECT *, CASE WHEN Fecha_Prev IS NULL AND julianday(Fecha_INT) - julianday(Fecha_DX) BETWEEN 0 AND 30 THEN 0
        WHEN Fecha_Prev IS NOT NULL AND julianday(Fecha_INT) - julianday(Fecha_Prev) BETWEEN 7 AND 30 THEN 0 ELSE 1 END AS ROMPE_CADENA
        FROM INTERV_ORDENADA),
    INTERV_GRUPO AS (SELECT *, SUM(ROMPE_CADENA) OVER (PARTITION BY Id_Paciente ORDER BY Fecha_INT) AS GRUPO_CADENA
        FROM INTERV_FLAGGED),
    INTERV_CADENA_VALIDA AS (SELECT Id_Paciente, GRUPO_CADENA, COUNT(*) AS N_INTERVENCIONES
        FROM INTERV_GRUPO GROUP BY Id_Paciente, GRUPO_CADENA HAVING COUNT(*) >= 6),
    INTERV_OK AS (SELECT DISTINCT Id_Paciente FROM INTERV_CADENA_VALIDA),
    RESULTADO AS (SELECT A.Id_Paciente, A.Id_Establecimiento, A.Fecha_APN, 1 AS DENOMINADOR,
        CASE WHEN CO.Id_Paciente IS NOT NULL AND IO.Id_Paciente IS NOT NULL THEN 1 ELSE 0 END AS NUMERADOR
        FROM APN A INNER JOIN TAMIZAJE T ON T.Id_Paciente = A.Id_Paciente AND T.Id_Establecimiento = A.Id_Establecimiento
        INNER JOIN VIOLENCIA V ON V.Id_Paciente = A.Id_Paciente AND V.Id_Establecimiento = A.Id_Establecimiento
        INNER JOIN DX D ON D.Id_Paciente = A.Id_Paciente AND D.Id_Establecimiento = A.Id_Establecimiento
        LEFT JOIN CSM_OK CO ON CO.Id_Paciente = A.Id_Paciente
        LEFT JOIN INTERV_OK IO ON IO.Id_Paciente = A.Id_Paciente)
    SELECT P.Id_Paciente, P.Numero_Documento AS DNI_PACIENTE,
        P.Apellido_Paterno_Paciente || ' ' || P.Apellido_Materno_Paciente || ' ' || P.Nombres_Paciente AS PACIENTE,
        MIN(R.Fecha_APN) AS PRIMERA_FECHA_ATENCION, MAX(N.Anio_Actual_Paciente) AS EDAD_ANIO,
        MAX(R.DENOMINADOR) AS DENOMINADOR, MAX(R.NUMERADOR) AS NUMERADOR
    FROM RESULTADO R INNER JOIN MaestroPaciente P ON P.Id_Paciente = R.Id_Paciente
    INNER JOIN NominalTrama N ON N.Id_Paciente = R.Id_Paciente
    GROUP BY P.Id_Paciente, P.Numero_Documento, PACIENTE ORDER BY PRIMERA_FECHA_ATENCION`;
}

// Mostrar resultados
function mostrarResultados(df, resumen) {
    document.getElementById('resultadosCard').style.display = 'block';
    
    document.getElementById('resumenBox').innerHTML = `
        <div class="resumen-grid">
            <div class="resumen-item"><span class="label">Total Pacientes</span>
                <span class="value">${resumen.total}</span></div>
            <div class="resumen-item"><span class="label">Denominador</span>
                <span class="value">${resumen.denominador}</span></div>
            <div class="resumen-item"><span class="label">Numerador</span>
                <span class="value ${resumen.numerador > 0 ? 'success' : 'warning'}">${resumen.numerador}</span></div>
            <div class="resumen-item"><span class="label">% Avance</span>
                <span class="value ${resumen.porcentaje >= 50 ? 'success' : resumen.porcentaje > 0 ? 'warning' : 'danger'}">${resumen.porcentaje.toFixed(2)}%</span></div>
        </div>
    `;
    
    const columns = Object.keys(df[0]);
    document.getElementById('tableHead').innerHTML = `<tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr>`;
    
    document.getElementById('tableBody').innerHTML = df.map(row => {
        const isNumerador = row.NUMERADOR === 1;
        return `<tr>${columns.map(col => {
            const value = row[col] !== undefined ? row[col] : '';
            const cls = col === 'NUMERADOR' && value === 1 ? 'numerador-1' : '';
            return `<td class="${cls}">${value}</td>`;
        }).join('')}</tr>`;
    }).join('');
    
    document.getElementById('rowCount').textContent = `${df.length} filas`;
}

// Exportar Excel
function exportToExcel() {
    if (!state.resultado || state.resultado.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    try {
        // Crear libro de trabajo
        const wb = XLSX.utils.book_new();
        
        // Preparar datos
        const data = state.resultado.map(row => ({...row}));
        
        // Agregar filas de resumen
        const resumenData = [
            ['REPORTE NOMINAL DE PACIENTES ÚNICOS - ' + document.getElementById('indicadorSelect').value],
            ['Pacientes únicos totales: ' + state.resumen.total + ' | Fecha proceso: ' + new Date().toLocaleString()],
            ['RESUMEN -> Denominador: ' + state.resumen.denominador + ' | Numerador: ' + state.resumen.numerador + ' | % Avance: ' + state.resumen.porcentaje.toFixed(2) + '%'],
            [],
            []
        ];
        
        // Obtener columnas y datos
        const columns = Object.keys(data[0] || {});
        const headerRow = columns;
        
        // Crear array de datos con encabezados
        const dataRows = data.map(row => columns.map(col => row[col] || ''));
        
        // Combinar todo
        const allData = [...resumenData, headerRow, ...dataRows];
        
        // Crear hoja de trabajo
        const ws = XLSX.utils.aoa_to_sheet(allData);
        
        // Establecer anchos de columna
        const colWidths = columns.map(col => ({
            wch: Math.max(col.length * 1.2, 15)
        }));
        ws['!cols'] = colWidths;
        
        // Fusionar celdas para el título
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: columns.length - 1 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: columns.length - 1 } }
        ];
        
        // Agregar hoja al libro
        XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
        
        // Generar archivo
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        
        // Descargar
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const fecha = new Date().toISOString().split('T')[0];
        link.download = `INDICADOR_VI-01_${fecha}.xlsx`;
        link.click();
        URL.revokeObjectURL(link.href);
        
        addLog('✅ Reporte exportado a Excel con formato premium');
        
    } catch (error) {
        addLog('❌ Error al exportar: ' + error.message);
        alert('Error al exportar: ' + error.message);
    }
}
