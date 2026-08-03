/* LAZARUS — sample "corpses" (dead code snippets) */
/* global window */
(function () {
  "use strict";

  window.LAZARUS = window.LAZARUS || {};
  window.LAZARUS.samples = {
    cobol: [
      {
        name: "Payroll calculator (classic mainframe)",
        code: `      IDENTIFICATION DIVISION.
      PROGRAM-ID. PAYROLL.
      AUTHOR. UNKNOWN-MAINFRAME-DEV.
      DATA DIVISION.
      WORKING-STORAGE SECTION.
      01 WS-HOURS PIC 9(3) VALUE 40.
      01 WS-RATE PIC 9(3)V99 VALUE 25.50.
      01 WS-GROSS PIC 9(6)V99.
      01 WS-TAX PIC 9(6)V99.
      01 WS-NET PIC 9(6)V99.
      PROCEDURE DIVISION.
      MAIN-PARA.
          COMPUTE WS-GROSS = WS-HOURS * WS-RATE
          COMPUTE WS-TAX = WS-GROSS * 0.2
          SUBTRACT WS-TAX FROM WS-GROSS GIVING WS-NET
          DISPLAY 'GROSS PAY: ' WS-GROSS
          DISPLAY 'TAX: ' WS-TAX
          DISPLAY 'NET PAY: ' WS-NET
          STOP RUN.`
      },
      {
        name: "Counter loop with PERFORM UNTIL",
        code: `      IDENTIFICATION DIVISION.
      PROGRAM-ID. COUNTER.
      DATA DIVISION.
      WORKING-STORAGE SECTION.
      01 WS-COUNT PIC 9(2) VALUE 1.
      PROCEDURE DIVISION.
          PERFORM UNTIL WS-COUNT IS GREATER THAN 10
              DISPLAY 'COUNT IS ' WS-COUNT
              ADD 1 TO WS-COUNT
          END-PERFORM
          DISPLAY 'DONE COUNTING'
          STOP RUN.`
      }
    ],

    pascal: [
      {
        name: "Fibonacci (Turbo Pascal style)",
        code: `program Fibonacci;
var
  i, a, b, temp : integer;
begin
  a := 0;
  b := 1;
  writeln('First 10 Fibonacci numbers:');
  for i := 1 to 10 do
  begin
    writeln(a);
    temp := a + b;
    a := b;
    b := temp;
  end;
end.`
      },
      {
        name: "Guess checker with repeat..until",
        code: `program GuessGame;
var
  secret, guess, tries : integer;
begin
  secret := 7;
  tries := 0;
  guess := 0;
  repeat
    guess := guess + 1;
    tries := tries + 1;
    writeln('Trying: ', guess);
  until guess = secret;
  writeln('Found it in ', tries, ' tries!');
end.`
      }
    ],

    vb6: [
      {
        name: "Grade calculator (Sub + If/ElseIf)",
        code: `Option Explicit

Private Sub CalculateGrade()
    Dim score As Integer
    Dim grade As String
    score = 87
    If score >= 90 Then
        grade = "A"
    ElseIf score >= 80 Then
        grade = "B"
    ElseIf score >= 70 Then
        grade = "C"
    Else
        grade = "F"
    End If
    MsgBox "Your grade is: " & grade
End Sub`
      },
      {
        name: "Compound interest with For loop",
        code: `Private Sub CompoundInterest()
    Dim principal As Double
    Dim rate As Double
    Dim year As Integer
    principal = 1000
    rate = 0.05
    For year = 1 To 10
        principal = principal * (1 + rate)
        Debug.Print "Year " & year & ": " & principal
    Next year
    MsgBox "Final amount: " & principal
End Sub`
      }
    ],

    basic: [
      {
        name: "Countdown with GOTO (true spaghetti)",
        code: `10 REM CLASSIC COUNTDOWN
20 LET N = 10
30 PRINT "T-MINUS "; N
40 LET N = N - 1
50 IF N > 0 THEN 30
60 PRINT "LIFTOFF!"
70 END`
      },
      {
        name: "Times table (structured, no GOTO)",
        code: `10 REM SEVEN TIMES TABLE
20 FOR I = 1 TO 12
30 PRINT I; " x 7 = "; I * 7
40 NEXT I
50 PRINT "DONE"
60 END`
      }
    ]
  };
})();
