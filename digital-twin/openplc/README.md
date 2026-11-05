# Programa de prueba de OpenPLC

`gemelo_digital_demo.st` define un mapa Modbus mínimo para enlazar OpenPLC con el puente Python:

| Variable IEC | Tipo Modbus | Dirección base 0 | Uso |
|---|---|---:|---|
| `%IX0.0` | Discrete input | 0 | Entrada digital, lectura |
| `%QX0.0` | Coil | 0 | Salida digital, lectura/escritura |
| `%IW0` | Input register | 0 | Registro de entrada, lectura |
| `%QW0` | Holding register | 0 | Registro de comando, lectura/escritura |

El programa no asigna lógica a las salidas mapeadas. Esto permite comprobar las comunicaciones y mantener los valores escritos por Modbus durante el ciclo de prueba. `CiclosInternos` solo confirma que el programa ejecuta su ciclo.

Este es un ejemplo para banco/simulador, no una lógica de proceso para maquinaria. Confirma las asignaciones de E/S antes de conectar actuadores. El puente local debe leer una dirección y una variable de cada área para coincidir con este mapa.

