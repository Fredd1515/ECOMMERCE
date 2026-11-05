(*
    Programa inicial de prueba para OpenPLC.

    Mapa Modbus (direcciones base 0):
      %IX0.0  -> Discrete input 0 (solo lectura)
      %QX0.0  -> Coil 0 (escritura desde el panel)
      %IW0    -> Input register 0 (solo lectura)
      %QW0    -> Holding register 0 (escritura desde el panel)

    Es un mapa de demostración. No conectes %QX0.0 a un actuador real
    hasta comprobar el cableado y validar la lógica de seguridad.
*)

PROGRAM GemeloDigitalDemo
VAR
    EntradaDigital AT %IX0.0 : BOOL;
    SalidaDigital AT %QX0.0 : BOOL;
    RegistroEntrada AT %IW0 : UINT;
    RegistroComando AT %QW0 : UINT;
    CiclosInternos : UINT := 0;
END_VAR

(* Contador de actividad interno; no modifica entradas ni salidas mapeadas. *)
IF CiclosInternos < 65535 THEN
    CiclosInternos := CiclosInternos + 1;
ELSE
    CiclosInternos := 0;
END_IF;

END_PROGRAM

CONFIGURATION Config0
RESOURCE Res0 ON PLC
    TASK Main(INTERVAL := T#100ms, PRIORITY := 0);
    PROGRAM Inst0 WITH Main : GemeloDigitalDemo;
END_RESOURCE
END_CONFIGURATION

