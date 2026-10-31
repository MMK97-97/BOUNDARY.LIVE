const $=id=>document.getElementById(id);
export function installStudioAccount({state,api,notice,updateControls,connectIdentity}) {
  let available=false,registered=null,busy=false,revision=0,configurationMessage='';
  const locked=()=>Boolean(busy||state.connecting||state.live||state.starting||state.stopping||state.youtubeBusy||state.destinationBusy);
  const fields=['accountEmail','accountPassword','accountDeviceName','accountSignIn','accountCreateEmail','accountCreatePassword','accountConfirmPassword','accountSetupToken','accountCreateDevice','accountCreate','accountRecoveryEmail','accountRecoveryPassword','accountRecoveryConfirm','accountRecoveryToken','accountRecover','accountCurrentPassword','accountNewPassword','accountNewConfirm','accountChangePassword'];
  function update() {
    const remembered=Boolean(state.info?.savedStudio?.remembered),signedIn=remembered&&registered===true;
    $('accountPanel').hidden=!available;
    $('accountLoginForm').hidden=registered!==true||signedIn;
    $('accountCreateForm').hidden=registered!==false;
    $('accountRecoveryDetails').hidden=signedIn||registered===false;
    $('accountPasswordDetails').hidden=!signedIn;
    $('accountIdentity').hidden=!signedIn;
    $('accountIdentity').textContent=signedIn?'Signed in as '+(state.info?.savedStudio?.account?.email||'studio owner'):'';
    $('accountHeading').textContent=signedIn?'Your MK97 account':registered===false?'Create your MK97 account':'Sign in to MK97';
    $('accountHelp').textContent=configurationMessage||(registered===false?'Create one studio account. Use its email and password on every device.':signedIn?'Your studio connections are saved. Other devices can sign in with the same account.':'Sign in with your studio account. This device stays signed in for 30 days.');
    if(available&&registered!==null)$('cloudDiscovery').textContent=state.session?'Your studio is connected. Manage your account and remembered devices below.':registered?'Sign in with your MK97 email and password to connect this device.':'Create your MK97 account once, then use it on every device.';
    $('accountSetupTokenRow').hidden=Boolean(state.session);$('accountSetupToken').required=!state.session;
    for(const id of fields)$(id).disabled=!available||locked()||registered===null&&!id.startsWith('accountRecovery')&&id!=='accountRecover';
    $('accountSignIn').textContent=busy?'Signing in…':'Sign in';
    $('accountCreate').textContent=busy?'Creating account…':'Create account & sign in';
    $('accountQuickLabel').textContent=!state.session&&available?(registered===false?'Create account':'Sign in to MK97'):'Set up stream';
    $('accountMenuOpen').textContent=state.session?'Studio account':'Sign in to MK97';
  }
  function accept(info) {
    if(info?.savedStudio?.account){registered=Boolean(info.savedStudio.account.configured);configurationMessage='';}
    update();
  }
  async function configure(config,eligible) {
    available=Boolean(eligible);configurationMessage='';
    if(!available){registered=null;update();return;}
    const generation=revision;update();
    try {const result=await api('/api/account/status',{},null);if(generation===revision)registered=Boolean(result.configured);}
    catch(e){if(generation===revision)configurationMessage=e.status===404?'Deploy MK97 1.8.0 on the cloud service to enable account sign-in.':e.message;}
    update();
  }
  async function run(path,value,authorization,secretIds,message) {
    if(!available||locked())return;
    const previousSession=state.session;
    busy=true;revision++;state.connecting=true;$('accountMessage').textContent='';updateControls();update();
    try {
      const identity=await api(path,{method:'POST',body:JSON.stringify(value),timeoutMs:60000},authorization);
      if(state.session!==previousSession)return;
      for(const id of secretIds)$(id).value='';registered=true;configurationMessage='';await connectIdentity(identity,true);
      $('legacyConnectionDetails').open=false;$('accountRecoveryDetails').open=false;$('accountPasswordDetails').open=false;
      $('accountMessage').textContent=identity.deviceReplaced?'Signed in. The oldest remembered device was signed out to make room.':message;
    }catch(e){$('accountMessage').textContent=e.message;notice(e.message,'error');
      if(e.status===409&&path.endsWith('/register')){try{registered=Boolean((await api('/api/account/status',{},null)).configured);}catch{}}
    }finally{for(const id of secretIds)$(id).value='';value.password='';value.currentPassword='';authorization='';busy=false;state.connecting=false;updateControls();update();}
  }
  function matching(first,second){if($(first).value!==$(second).value){$('accountMessage').textContent='Passwords do not match.';$(second).focus();return false;}return true;}
  $('accountLoginForm').addEventListener('submit',event=>{event.preventDefault();return run('/api/account/login',{email:$('accountEmail').value,password:$('accountPassword').value,deviceName:$('accountDeviceName').value},null,['accountPassword'],'Signed in. Your saved studio is ready.');});
  $('accountCreateForm').addEventListener('submit',event=>{event.preventDefault();if(!matching('accountCreatePassword','accountConfirmPassword'))return;
    return run('/api/account/register',{email:$('accountCreateEmail').value,password:$('accountCreatePassword').value,deviceName:$('accountCreateDevice').value},state.session||$('accountSetupToken').value.trim(),['accountCreatePassword','accountConfirmPassword','accountSetupToken'],'Account created. Sign in with this email and password on any device.');});
  $('accountRecoveryForm').addEventListener('submit',event=>{event.preventDefault();if(!matching('accountRecoveryPassword','accountRecoveryConfirm'))return;
    return run('/api/account/recover',{email:$('accountRecoveryEmail').value,password:$('accountRecoveryPassword').value,deviceName:'Recovered device'},$('accountRecoveryToken').value.trim(),['accountRecoveryPassword','accountRecoveryConfirm','accountRecoveryToken'],'Account recovered. Other devices were signed out; saved platform connections were kept.');});
  $('accountPasswordForm').addEventListener('submit',event=>{event.preventDefault();if(!matching('accountNewPassword','accountNewConfirm'))return;
    return run('/api/account/password',{currentPassword:$('accountCurrentPassword').value,password:$('accountNewPassword').value,deviceName:'My device'},state.session,['accountCurrentPassword','accountNewPassword','accountNewConfirm'],'Password changed. Other remembered devices were signed out.');});
  update();return{configure,accept,update};
}
