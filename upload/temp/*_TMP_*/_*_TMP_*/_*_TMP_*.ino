
#include "apioGeneral.h"

#include "atmegarfr2.h"
#include "config.h"
#include "hal.h"
#include "halTimer.h"
#include "nwk.h"
#include "nwkCommand.h"
#include "nwkDataReq.h"
#include "nwkFrame.h"
#include "nwkGroup.h"
#include "nwkRoute.h"
#include "nwkRouteDiscovery.h"
#include "nwkRx.h"
#include "nwkSecurity.h"
#include "nwkTx.h"
#include "phy.h"
#include "sys.h"
#include "sysConfig.h"
#include "sysEncrypt.h"
#include "sysTimer.h"
#include "sysTypes.h"

#include "ApioLwm.h"
int pin2=2;
void setup() {
	generalSetup();
	apioSetup(20);
	apioSend("20:hi::-");
	pinMode(pin2,OUTPUT);
}

void loop(){
	apioLoop();
	if(property=="onoff"){
		if(value=="1"){
			digitalWrite(pin2,HIGH);
			//Do Something
		}
		if(value=="0"){
			digitalWrite(pin2,LOW);
			//Do Something
		}
	}
}