// Sinh unit với đường dẫn tuyệt đối; không phụ thuộc shell profile hoặc nvm của systemd.
function quote(value,exec=false){
  if(/[\n\r\0]/.test(value))throw new Error('Đường dẫn có ký tự không hợp lệ.');
  let text=value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%');
  if(exec)text=text.replaceAll('$','$$');
  return `"${text}"`;
}
export function serviceUnit({node,cli,session,credentials,state}){
  const args=[node,cli,...(session?['--session',session]:[]),...(credentials?['--credentials',credentials]:[])];
  return `[Unit]
Description=Chibi Farm Helper
StartLimitIntervalSec=600
StartLimitBurst=5

[Service]
Type=exec
ExecStart=${args.map(v=>quote(v,true)).join(' ')}
Environment=${quote('CHIBI_STATE_FILE='+state)}
Restart=on-failure
RestartSec=60
RestartPreventExitStatus=78
TimeoutStopSec=45
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
`;
}
