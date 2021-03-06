import { EventBus } from "../eventbus.js";
import { AppHelperBase } from "../apphelperbase.js";
import { ControlSettings } from "./controlsetting.js";
import { SettingEncryptionPassword, SettingSingleOption, SettingTheme, SettingThemeAccentColor, SettingEventGhostNodeRedPort, SettingCompanionAppPortToConnect } from "./setting.js";
import { UtilDOM } from "../utildom.js";

/**@type {App} */
let app = null;
export class AppHelperSettings extends AppHelperBase{
 /**
     * 
     * @param {App} app 
     */
    constructor(args = {app,connectoport}){
        super(args.app);
        app = args.app;
        this.connectoport = args.connectoport;
    }
    get settingsList(){
        return  new ControlSettings([
            new SettingCompanionAppPortToConnect(),
            new SettingEncryptionPassword(),
            new SettingEventGhostNodeRedPort(),
            new SettingTheme(),
            new SettingThemeAccentColor()
        ]);
    }
    async load(){
        EventBus.register(this);     
        app.controlTop.appName = `Join Settings`;
        app.controlTop.appNameClickable = false;    
        app.controlTop.loading = false;      
        app.controlTop.shouldAlwaysShowImageRefresh = false;  

        this.controlSettings = this.settingsList;
        await app.addElement(this.controlSettings);

        if(this.connectoport){
            const setting = new SettingCompanionAppPortToConnect();
            const value = this.connectoport;
            await this.handleSettingSaved(setting,value);
        }
    }
    updateUrl(){
        Util.changeUrl("/?settings");
    }
    get isPanel(){
        return true;
    }
    async handleSettingSaved(setting, value){
        if(setting.id == SettingEncryptionPassword.id && value){
            const email = await app.userEmail;
            value = await Encryption.getEncryptedPasswordInBase64({password:value,salt:email,iterations:5000});
        }
        if(setting.id == SettingEventGhostNodeRedPort.id && value){
            value = parseInt(value);
            const {ControlDialogDialogProgress,ControlDialogOk} = (await import("../dialog/controldialog.js"))
            const dialog = await ControlDialogDialogProgress.show({title:"Testing",text:"Checking if port is listening..."})
            const {GCMPush} = await import("../gcm/gcmapp.js");
            const gcmPush = new GCMPush();
            gcmPush.senderId = app.myDeviceId;
            gcmPush.push = {title:"Test",text:"Testing from Join website..."};
            const {SettingAutomationPortFullPush} = (await import("../settings/setting.js"))
            const settingAutomationPortFullPush = new SettingAutomationPortFullPush();
            try{
                //Try full push first
                await gcmPush.sendToLocalPort({port:value});
                await ControlDialogOk.showAndWait({title:"Success!",text:`Sending full pushes to ${value}`});
                settingAutomationPortFullPush.value = true;
            }catch(error){
                try{
                    //If it doesn't work try only test push (eventgost only works with that for example)                    
                    await gcmPush.sendTextToLocalPort({port:value});
                    await ControlDialogOk.showAndWait({title:"Success!",text:`Sending text pushes to ${value}`});
                    settingAutomationPortFullPush.value = false;
                }catch{
                    await ControlDialogOk.showAndWait({title:"Error!",text:`Couldn't connect. Make sure that the app is listening on port ${value}.`});
                    console.log(error);
                    value = null;
                    settingAutomationPortFullPush.value = false;
                }
            }finally{                
                await dialog.dispose();
            }
        }
        if(setting.id == SettingCompanionAppPortToConnect.id && value){
            value = parseInt(value);
            const {ControlDialogDialogProgress,ControlDialogOk} = (await import("../dialog/controldialog.js"))
            const dialog = await ControlDialogDialogProgress.show({title:"Testing",text:"Checking if companion app is available..."})
            const {GCMPush} = await import("../gcm/gcmapp.js");
            const gcmPush = new GCMPush();
            gcmPush.companionBrowserId = app.myDeviceId;
            gcmPush.senderId = app.myDeviceId;
            gcmPush.push = {title:"Join Desktop",text:"Successfully connected!"};
            try{
                //Try full push first
                await gcmPush.sendToLocalPort({port:value});
                try{
                    await ControlDialogOk.showAndWait({title:"Success!",text:`The companion app is working! Will now open a new tab to authenticate your user on it...`});
                    const googleDriveScopes = encodeURIComponent("https://www.googleapis.com/auth/drive.appfolder https://www.googleapis.com/auth/drive.file")
                    Util.openWindow(`https://accounts.google.com/o/oauth2/v2/auth?client_id=596310809542-giumrib7hohfiftljqmj7eaio3kl21ek.apps.googleusercontent.com&redirect_uri=http://127.0.0.1:${value}&response_type=code&scope=email%20profile%20${googleDriveScopes}&code_challenge&login_hint=${await app.userEmail}`);
                    await UtilDOM.waitForWindowFocus();
                    UtilDOM.addStyle(`.companiondialogok{
                        max-width: 400px;
                    }
                    .companiondialogok>div{
                        padding:8px;
                    }
                    `)
                    await ControlDialogOk.showAndWait({timeout:60000,title:"Success!",text:`<div class="companiondialogok"><div>Companion app is now correctly configured!</div><div>You may now close this window.</div><div>If your Android devices' local IP addresses don't change and you manually set the ports in the <b>Android App &gt; Settings &gt; Local Network &gt; Advanced</b> you don't need to keep this browser open.</div><div>Otherwise you can close this browser window as long as you keep your browser open so that it can receive pushes.</div></div>`});
                }catch{}
            }catch(error){               
                await ControlDialogOk.showAndWait({title:"Error!",text:`Couldn't connect. Make sure that the app is listening on the port you configure here.`});
                console.log(error);
                value = null;
            }finally{                
                await dialog.dispose();
            }
        }
        setting.value = value;
        await this.controlSettings.update(setting);
    }
    async onSettingSaved(settingSaved){
        const setting = settingSaved.setting;
        let value = settingSaved.value;
        if(!setting) return;

        await this.handleSettingSaved(setting,value);
    }
}